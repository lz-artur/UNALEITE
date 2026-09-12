const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: prods } = await supabase.from('finished_products').select('*').limit(1);
  console.log('Products:', prods);
  const { data: lots } = await supabase.from('finished_product_lots').select('*').limit(1);
  console.log('Lots:', lots);
}
run();
