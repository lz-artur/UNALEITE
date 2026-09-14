const crypto = require('crypto');
const fs = require('fs');

const envContent = fs.readFileSync('./backend/.env', 'utf-8');
const tokenMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
const token = tokenMatch ? tokenMatch[1] : '';

const API_URL = 'http://localhost:3001/api';

async function fetchApi(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${JSON.stringify(data)}`);
  }
  return data;
}

async function runQA() {
  console.log('--- Iniciando Teste de QA de Atendimento Parcial (Banco de Homologação) ---');

  try {
    // 1. Get a client
    console.log('1. Buscando clientes...');
    const clientsRes = await fetchApi('/clients');
    console.log('Resposta de /clients:', clientsRes);
    const client = clientsRes.length ? clientsRes[0] : clientsRes.data ? clientsRes.data[0] : null;
    if (!client) throw new Error('Nenhum cliente encontrado no banco de homologação.');
    console.log(`Cliente selecionado: ${client.name} (ID: ${client.id})`);

    // 2. Get a product
    console.log('2. Buscando produtos...');
    const productsRes = await fetchApi('/inventory/finished-product-lots');
    const lot = productsRes.find(l => l.availableQuantity >= 10);
    if (!lot) throw new Error('Nenhum lote com pelo menos 10 unidades encontrado.');
    console.log(`Lote selecionado: ${lot.lotCode} (Produto ID: ${lot.productId}, Disp: ${lot.availableQuantity})`);

    // 3. Create a Sales Order
    console.log('3. Criando Pedido de Venda...');
    const orderPayload = {
      clientId: client.id,
      orderDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      notes: 'QA Test - Pedido de Venda',
      items: [{
        productId: lot.productId,
        quantity: 10,
        unitPrice: 25.50
      }]
    };
    
    const orderRes = await fetchApi('/sales-orders', {
      method: 'POST',
      body: JSON.stringify(orderPayload)
    });
    const orderId = orderRes.id;
    console.log(`Pedido criado: ID ${orderId}, Número: ${orderRes.number}, Total: R$ ${orderRes.totalAmount}`);

    // 4. Fulfill partially (5 units)
    console.log('4. Realizando Atendimento Parcial (5 unidades)...');
    const fulfillPayload = {
      idempotencyKey: crypto.randomUUID(),
      fulfilledAt: new Date().toISOString(),
      items: [{
        salesOrderItemId: orderRes.items[0].id,
        finishedProductLotId: lot.id,
        quantity: 5
      }]
    };

    const updatedOrder = await fetchApi(`/sales-orders/${orderId}/fulfill`, {
      method: 'POST',
      body: JSON.stringify(fulfillPayload)
    });
    
    console.log('Atendimento Parcial Concluído.');
    console.log(`Status do Pedido: ${updatedOrder.status}`);
    console.log(`Valor Original: R$ ${updatedOrder.totalAmount}`);
    console.log(`Valor Atendido: R$ ${updatedOrder.totalFulfilled || 0}`);
    console.log(`Saldo Pendente: R$ ${updatedOrder.remainingAmount || 0}`);
    console.log(`Atendimentos Registrados: ${updatedOrder.attendances ? updatedOrder.attendances.length : 0}`);

    if (updatedOrder.status !== 'Parcialmente Atendido') {
      throw new Error(`Status incorreto. Esperado: Parcialmente Atendido, Recebido: ${updatedOrder.status}`);
    }

    if (updatedOrder.totalFulfilled !== 5 * 25.50) {
      throw new Error('Valor atendido incorreto.');
    }

    // 5. Cancel Attendance
    console.log('5. Cancelando Atendimento...');
    const attendanceId = updatedOrder.attendances[0].id;
    
    const revertedOrder = await fetchApi(`/sales-orders/${orderId}/attendances/${attendanceId}/cancel`, {
      method: 'POST'
    });

    console.log('Cancelamento Concluído.');
    console.log(`Status do Pedido: ${revertedOrder.status}`);
    console.log(`Valor Original: R$ ${revertedOrder.totalAmount}`);
    console.log(`Valor Atendido: R$ ${revertedOrder.totalFulfilled || 0}`);
    console.log(`Atendimentos Cancelados: ${revertedOrder.attendances.filter(a => a.status === 'Cancelado').length}`);

    if (revertedOrder.status !== 'Aberto') {
      throw new Error(`Status incorreto pós-cancelamento. Esperado: Aberto, Recebido: ${revertedOrder.status}`);
    }

    // 6. Delete the order to clean up
    console.log('6. Limpando dados do teste (Deletando pedido)...');
    await fetchApi(`/sales-orders/${orderId}`, { method: 'DELETE' });
    console.log('Limpeza concluída.');

    console.log('--- TESTE DE QA PASSOU COM SUCESSO ---');
  } catch (error) {
    console.error('--- ERRO NO TESTE DE QA ---');
    console.error(error.message);
  }
}

runQA();
