require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: orders, error } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('number', 'VEN-2026-1787323653830');
    
    if (error) {
        console.error('Error fetching from sales_orders:', error);
        
        // Try 'pedidos' or other names if sales_orders fails
        const { data: pedidos, err2 } = await supabase.from('pedidos').select('*').eq('numero', 'VEN-2026-1787323653830');
        if (err2) console.error('Error fetching from pedidos:', err2);
        else console.log('Pedidos:', pedidos);
        
        return;
    }
    
    console.log('Orders:', orders);
    
    if (orders && orders.length > 0) {
        const order = orders[0];
        console.log('Order Items...');
        const { data: items } = await supabase
            .from('sales_order_items')
            .select('*')
            .eq('order_id', order.id);
        console.log(items);
        
        console.log('Fulfillments...');
        const { data: fulfillments } = await supabase
            .from('sales_fulfillments')
            .select('*')
            .eq('order_id', order.id);
        console.log(fulfillments);
        
        if (fulfillments && fulfillments.length > 0) {
             for (const f of fulfillments) {
                 console.log('Fulfillment Lots for', f.id);
                 const { data: f_lots } = await supabase
                     .from('sales_fulfillment_lots')
                     .select('*')
                     .eq('fulfillment_id', f.id);
                 console.log(f_lots);
             }
        }
    }
}

main();
