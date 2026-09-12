const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('--- Seeding Homologation Database ---');
  
  // 1. Create Client
  let { data: client } = await supabase.from('clients').select('id').eq('document', '12345678901').maybeSingle();
  if (!client) {
    const res = await supabase.from('clients').insert({ name: 'Cliente QA Test', document: '12345678901' }).select().single();
    if (res.error) throw res.error;
    client = res.data;
  }
  console.log('Client:', client.id);

  // 1b. Get a Unit
  const { data: unit } = await supabase.from('units').select('id').limit(1).single();
  if (!unit) throw new Error('No unit found in DB');

  // 2. Get Product
  let { data: product } = await supabase.from('finished_products').select('id').limit(1).maybeSingle();
  if (!product) throw new Error('No products found in DB');
  console.log('Product:', product.id);

  // 3. Create Finished Product Lot
  let { data: lot } = await supabase.from('finished_product_lots').select('id').eq('lot_code', 'LOTE-QA-1').maybeSingle();
  if (!lot) {
    const res = await supabase.from('finished_product_lots').insert({
      product_id: product.id, lot_code: 'LOTE-QA-1', available_quantity: 100
    }).select().single();
    if (res.error) throw res.error;
    lot = res.data;
  }
  console.log('Lot:', lot.id);

  // 4. Ensure cost centers and accounting categories exist for financial generation
  const { error: err4 } = await supabase.from('cost_centers').upsert({ id: 'de505acc-6ec9-4a02-9c00-1ee14a1f7fee', name: 'OPERACIONAL', type: 'Despesa' });
  if (err4) throw err4;
  
  const { error: err5 } = await supabase.from('accounting_categories').upsert({ id: 'bcc948c3-f421-49e8-9980-b5c3e37a5641', name: 'RECEITAS OPERACIONAIS', type: 'Receita' });
  if (err5) throw err5;

  const { error: err6 } = await supabase.from('accounting_subcategories').upsert({ id: 'd1dd0722-5190-4422-9815-55a914903e31', category_id: 'bcc948c3-f421-49e8-9980-b5c3e37a5641', name: 'Venda de Produtos Manufaturados', type: 'Receita' });
  if (err6) throw err6;
  
  console.log('Seeding complete.');
}

seed().catch(console.error);
