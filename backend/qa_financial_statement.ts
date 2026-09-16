import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
// @ts-ignore O projeto usa pg sem as declarações de tipo instaladas.
import { Client } from 'pg';
import { AppModule } from './src/app.module';
import { BankAccountsService } from './src/finance/bank-accounts.service';
import { FinanceService } from './src/finance/finance.service';

const QA_PREFIX = 'QA extrato bancário';
const QA_AMOUNT = 123.45;

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const finance = app.get(FinanceService);
  const bankAccounts = app.get(BankAccountsService);
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  const user = { id: randomUUID(), email: 'qa-financeiro@teste.local', role: 'admin', claims: {} };
  let accountId: string | undefined;
  let createdAccount = false;
  const entryIds: string[] = [];

  try {
    await pg.connect();
    const account = await pg.query('select id from bank_accounts where active = true order by created_at limit 1');
    if (account.rows[0]) {
      accountId = account.rows[0].id;
    } else {
      const created = await pg.query(
        'insert into bank_accounts (name, active) values ($1, true) returning id',
        [`${QA_PREFIX} — conta temporária`],
      );
      accountId = created.rows[0].id;
      createdAccount = true;
    }
    if (!accountId) throw new Error('Não foi possível preparar uma conta bancária para o QA.');
    const bankAccountId = accountId;

    const before = (await bankAccounts.listAccounts()).find((item: any) => item.id === bankAccountId)?.current_balance ?? 0;
    const dueDate = new Date().toISOString();

    const currentEntry: any = await finance.createEntry({
      entry_type: 'Receber', description: `${QA_PREFIX} — baixa rápida`, amount: QA_AMOUNT,
      due_date: dueDate, category: 'QA', status: 'Aberto', bank_account_id: bankAccountId,
    }, user);
    entryIds.push(currentEntry.id);
    await finance.settleEntry(currentEntry.id, { paymentDate: dueDate, paymentMethod: 'Pix' }, user);

    const statementAfterQuickSettlement = await bankAccounts.getAccountStatement(bankAccountId);
    const quickSettlementMovement = statementAfterQuickSettlement.find((movement: any) => movement.financial_entry_id === currentEntry.id);
    if (!quickSettlementMovement || quickSettlementMovement.bank_account_id !== bankAccountId || Number(quickSettlementMovement.amount) !== QA_AMOUNT) {
      throw new Error('A baixa rápida não foi refletida no extrato da conta vinculada.');
    }

    const after = (await bankAccounts.listAccounts()).find((item: any) => item.id === bankAccountId)?.current_balance ?? 0;
    if (Math.abs(Number(after) - Number(before) - QA_AMOUNT) > 0.001) {
      throw new Error('O saldo da conta não refletiu a baixa rápida.');
    }

    const legacyEntry: any = await finance.createEntry({
      entry_type: 'Receber', description: `${QA_PREFIX} — recibo legado`, amount: QA_AMOUNT,
      due_date: dueDate, category: 'QA', status: 'Aberto', bank_account_id: bankAccountId,
    }, user);
    entryIds.push(legacyEntry.id);
    await finance.settleEntry(legacyEntry.id, { paymentDate: dueDate, paymentMethod: 'Pix' }, user);
    await pg.query('update financial_entry_receipts set bank_account_id = null where financial_entry_id = $1', [legacyEntry.id]);

    const statementAfterLegacyRecovery = await bankAccounts.getAccountStatement(bankAccountId);
    if (!statementAfterLegacyRecovery.some((movement: any) => movement.financial_entry_id === legacyEntry.id && movement.bank_account_id === bankAccountId)) {
      throw new Error('O recibo legado sem conta não foi recuperado no extrato.');
    }

    console.log('QA financeiro aprovado: baixa rápida, saldo e recuperação de recibo legado.');
  } finally {
    for (const entryId of entryIds) await pg.query('delete from financial_entries where id = $1', [entryId]);
    if (createdAccount && accountId) await pg.query('delete from bank_accounts where id = $1', [accountId]);
    await pg.end();
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
