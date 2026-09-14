import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SalesService } from './src/sales/sales.service';
import { randomUUID } from 'crypto';
// @ts-ignore
import { Client } from 'pg';

async function runQA() {
  console.log('--- Iniciando Teste de QA via Nest Context (Banco de Homologação) ---');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const salesService = app.get(SalesService);

  const dbUrl = process.env.DATABASE_URL;
  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();

  let qaOrderId: string | null = null;
  let qaBankAccountId: string | null = null;
  let createdQaBankAccount = false;

  try {
    // 1. Get Client ID
    const c = await pg.query('SELECT id FROM clients LIMIT 1');
    const clientId = c.rows[0].id;
    console.log('Cliente ID:', clientId);

    // 2. Get Product and Lot
    const l = await pg.query('SELECT id, product_id, available_quantity FROM finished_product_lots WHERE available_quantity >= 10 LIMIT 1');
    const lotId = l.rows[0].id;
    const productId = l.rows[0].product_id;
    const initialLotQuantity = Number(l.rows[0].available_quantity);
    console.log('Lote ID:', lotId, 'Produto ID:', productId);

    // The validation requires an active receiving account. Create a disposable
    // one only if homologation has not been configured with a real account yet.
    const bank = await pg.query('SELECT id FROM bank_accounts WHERE active = TRUE LIMIT 1');
    if (bank.rows[0]) {
      qaBankAccountId = bank.rows[0].id;
    } else {
      const createdBank = await pg.query(
        'INSERT INTO bank_accounts (name, active) VALUES ($1, TRUE) RETURNING id',
        ['QA - Atendimento Parcial'],
      );
      qaBankAccountId = createdBank.rows[0].id;
      createdQaBankAccount = true;
    }

    const testUser = { id: randomUUID(), email: 'qa@test.com', role: 'admin', claims: {} };

    // 3. Create Sales Order
    console.log('Criando Pedido de Venda...');
    const order = await salesService.createSalesOrder({
      clientId,
      orderDate: new Date().toISOString(),
      items: [{
        productId,
        quantity: 10,
        unitPrice: 25.50
      }]
    }, testUser);
    qaOrderId = order.id;
    console.log(`Pedido criado: ID ${order.id}, Status: ${order.status}`);

    // 4.1 The backend must block bypass attempts that omit financial data.
    await expectRejection(
      () => salesService.fulfillSalesOrder(order.id, {
        idempotencyKey: randomUUID(),
        bankAccountId: qaBankAccountId!,
        items: [{ salesOrderItemId: order.items[0].id, finishedProductLotId: lotId, quantity: 5 }],
      } as any, testUser),
      'forma de pagamento',
    );
    await expectRejection(
      () => salesService.fulfillSalesOrder(order.id, {
        idempotencyKey: randomUUID(),
        paymentMethod: 'Pix',
        items: [{ salesOrderItemId: order.items[0].id, finishedProductLotId: lotId, quantity: 5 }],
      } as any, testUser),
      'conta de recebimento',
    );

    // 4.2 Fulfill partially (5 units)
    console.log('Realizando Atendimento Parcial...');
    const idempotencyKey = randomUUID();
    const fulfillRes = await salesService.fulfillSalesOrder(order.id, {
      idempotencyKey,
      paymentMethod: 'Pix',
      bankAccountId: qaBankAccountId,
      items: [{
        salesOrderItemId: order.items[0].id,
        finishedProductLotId: lotId,
        quantity: 5
      }]
    }, testUser);

    console.log(`Atendimento Concluído. Novo Status: ${fulfillRes.status}`);
    console.log(`Valor Atendido: R$ ${fulfillRes.totalFulfilled}`);
    
    if (fulfillRes.status !== 'Parcialmente Atendido') throw new Error('Status Incorreto');
    if (fulfillRes.totalFulfilled !== 127.5) throw new Error('Valor incorreto');
    if (fulfillRes.remainingAmount !== 127.5) throw new Error('Saldo pendente incorreto');
    if (fulfillRes.attendances.filter((attendance) => attendance.status === 'Concluído').length !== 1) {
      throw new Error('Quantidade de atendimentos concluídos incorreta');
    }

    const stockAfterFulfillment = await pg.query(
      'SELECT available_quantity FROM finished_product_lots WHERE id = $1',
      [lotId],
    );
    if (Number(stockAfterFulfillment.rows[0].available_quantity) !== initialLotQuantity - 5) {
      throw new Error('Estoque não foi baixado corretamente no atendimento parcial');
    }

    const attendanceId = fulfillRes.attendances[0].id;
    const financialEntry = await pg.query(
      'SELECT payment_method, bank_account_id, amount, status FROM financial_entries WHERE attendance_id = $1',
      [attendanceId],
    );
    if (
      financialEntry.rows.length !== 1
      || financialEntry.rows[0].payment_method !== 'Pix'
      || financialEntry.rows[0].bank_account_id !== qaBankAccountId
      || Number(financialEntry.rows[0].amount) !== 127.5
      || financialEntry.rows[0].status !== 'Aberto'
    ) {
      throw new Error('Conta a receber não foi criada com os dados financeiros corretos');
    }

    // Replaying the same command must not create a second attendance or lower stock twice.
    const replay = await salesService.fulfillSalesOrder(order.id, {
      idempotencyKey,
      paymentMethod: 'Pix',
      bankAccountId: qaBankAccountId,
      items: [{ salesOrderItemId: order.items[0].id, finishedProductLotId: lotId, quantity: 5 }],
    }, testUser);
    if (replay.attendances.filter((attendance) => attendance.status === 'Concluído').length !== 1) {
      throw new Error('A repetição criou um atendimento duplicado');
    }

    // 5. Cancel Attendance
    console.log('Cancelando Atendimento...');
    const cancelRes = await salesService.cancelAttendance(order.id, attendanceId, testUser);

    console.log(`Cancelamento Concluído. Novo Status: ${cancelRes.status}`);
    
    if (cancelRes.status !== 'Aberto') throw new Error('Status Incorreto pós-cancelamento');
    if (cancelRes.totalFulfilled !== 0 || cancelRes.remainingAmount !== 255) {
      throw new Error('Valores incorretos após o cancelamento');
    }

    const stockAfterCancel = await pg.query(
      'SELECT available_quantity FROM finished_product_lots WHERE id = $1',
      [lotId],
    );
    if (Number(stockAfterCancel.rows[0].available_quantity) !== initialLotQuantity) {
      throw new Error('Estoque não foi restaurado após o cancelamento');
    }

    const entriesAfterCancel = await pg.query(
      'SELECT id FROM financial_entries WHERE attendance_id = $1',
      [attendanceId],
    );
    if (entriesAfterCancel.rows.length !== 0) {
      throw new Error('Conta a receber permaneceu após o cancelamento');
    }

    console.log('--- TESTE DE QA PASSOU COM SUCESSO ---');

  } catch (err) {
    console.error('--- ERRO NO TESTE DE QA ---');
    console.error(err);
    process.exitCode = 1;
  } finally {
    // Cleanup directly in the database only after cancellation has restored stock.
    if (qaOrderId) {
      await pg.query('DELETE FROM sales_orders WHERE id = $1', [qaOrderId]);
    }
    if (createdQaBankAccount && qaBankAccountId) {
      await pg.query('DELETE FROM bank_accounts WHERE id = $1', [qaBankAccountId]);
    }
    await pg.end();
    await app.close();
  }
}

async function expectRejection(action: () => Promise<unknown>, message: string) {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return;
    throw error;
  }

  throw new Error(`A API aceitou um atendimento sem ${message}`);
}

runQA();
