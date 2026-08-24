require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRPC() {
  const { data, error } = await supabase.rpc('fulfill_sales_order_items', {
      p_sales_order_id: "00000000-0000-0000-0000-000000000000",
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_fulfilled_at: new Date().toISOString(),
      p_items: []
  });
  
  if (error) {
      console.log('Error:', error);
  } else {
      console.log('Success:', data);
  }
}

checkRPC();
