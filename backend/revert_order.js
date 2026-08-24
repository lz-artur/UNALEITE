require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const orderNumber = 'VEN-2026-1787323653830';
    
    // 1. Get the order
    const { data: orders, error: orderErr } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('order_number', orderNumber);
        
    if (orderErr) throw orderErr;
    if (!orders || orders.length === 0) {
        console.error('Order not found!');
        return;
    }
    
    const order = orders[0];
    console.log(`Found order: ${order.id}, Status: ${order.status}`);
    
    // 2. Get the items
    const { data: items, error: itemsErr } = await supabase
        .from('sales_order_items')
        .select('*')
        .eq('sales_order_id', order.id);
        
    if (itemsErr) throw itemsErr;
    console.log(`Found ${items.length} items`);
    
    // 3. Get the fulfillments
    const { data: fulfillments, error: fulfillmentsErr } = await supabase
        .from('sales_order_fulfillments')
        .select('*')
        .eq('sales_order_id', order.id);
        
    if (fulfillmentsErr) {
        console.error('Error fetching fulfillments by sales_order_id, trying by item id...');
        // maybe it only has sales_order_item_id
        return;
    }
    
    console.log(`Found ${fulfillments.length} fulfillments`);
    
    // 4. Restore lots
    for (const f of fulfillments) {
        console.log(`Processing fulfillment ${f.id} for lot ${f.finished_product_lot_id}, quantity ${f.quantity}`);
        
        // get current lot
        const { data: lotData } = await supabase
            .from('finished_product_lots')
            .select('*')
            .eq('id', f.finished_product_lot_id)
            .single();
            
        if (lotData) {
            const restoredVolume = Number(lotData.available_quantity) + Number(f.quantity);
            console.log(`Restoring lot ${lotData.lot_code}: ${lotData.available_quantity} -> ${restoredVolume}`);
            
            await supabase
                .from('finished_product_lots')
                .update({ available_quantity: restoredVolume })
                .eq('id', lotData.id);
        }
    }
    
    // 5. Delete fulfillments
    if (fulfillments.length > 0) {
        console.log('Deleting fulfillments...');
        await supabase
            .from('sales_order_fulfillments')
            .delete()
            .eq('sales_order_id', order.id);
    }
    
    // 6. Reset items fulfilled_quantity
    for (const item of items) {
        if (Number(item.fulfilled_quantity) > 0 || String(item.status) !== 'Aberto') {
            console.log(`Resetting item ${item.id} fulfilled_quantity from ${item.fulfilled_quantity} to 0`);
            await supabase
                .from('sales_order_items')
                .update({ fulfilled_quantity: 0, status: 'Aberto' })
                .eq('id', item.id);
        }
    }
    
    // 7. Reset order status to 'Aberto'
    if (order.status !== 'Aberto') {
        console.log(`Resetting order status to Aberto`);
        await supabase
            .from('sales_orders')
            .update({ status: 'Aberto' })
            .eq('id', order.id);
    }
    
    console.log('Done!');
}

main().catch(console.error);
