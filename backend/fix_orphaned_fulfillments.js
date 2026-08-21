const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://zzfvtugsgupcclfhprji.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZnZ0dWdzZ3VwY2NsZmhwcmppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc5ODY2OSwiZXhwIjoyMDk2Mzc0NjY5fQ.7QCKIh51puBvyh8kgPT5Hra1l7VB1mCasPPWHDONQ70');

async function fix() {
  const orderId = '583efa34-f711-4c06-a4c6-6c858f9d7889';

  console.log(`Buscando fulfillments do pedido ${orderId}...`);
  const { data: fulfillments, error: errFulfillments } = await supabase
    .from('sales_order_fulfillments')
    .select('*')
    .eq('sales_order_id', orderId);
    
  if (errFulfillments) throw errFulfillments;
  console.log(`Encontrados ${fulfillments.length} fulfillments.`);

  for (const f of fulfillments) {
    console.log(`Restaurando lote ${f.finished_product_lot_id}...`);
    // Pegar o lote atual
    const { data: lot } = await supabase
      .from('finished_product_lots')
      .select('available_quantity')
      .eq('id', f.finished_product_lot_id)
      .single();
      
    if (lot) {
      await supabase
        .from('finished_product_lots')
        .update({ available_quantity: lot.available_quantity + f.quantity })
        .eq('id', f.finished_product_lot_id);
    }
  }

  console.log(`Deletando fulfillments...`);
  await supabase
    .from('sales_order_fulfillments')
    .delete()
    .eq('sales_order_id', orderId);

  console.log(`Deletando stock_movements...`);
  await supabase
    .from('stock_movements')
    .delete()
    .eq('reference_table', 'sales_orders')
    .eq('reference_id', orderId);

  console.log(`Resetando sales_order_items...`);
  await supabase
    .from('sales_order_items')
    .update({ fulfilled_quantity: 0, status: 'Aberto' })
    .eq('sales_order_id', orderId);

  console.log(`Resetando sales_orders...`);
  await supabase
    .from('sales_orders')
    .update({ status: 'Aberto' })
    .eq('id', orderId);

  console.log('Finalizado com sucesso.');
}

fix().catch(console.error);
