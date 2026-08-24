const url = 'https://zzfvtugsgupcclfhprji.supabase.co/rest/v1';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZnZ0dWdzZ3VwY2NsZmhwcmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTg2NjksImV4cCI6MjA5NjM3NDY2OX0.Inb8ztQY9aXk33nIKa6eEqzu1Q2CJnVmlz7OkVdV-4s';

async function fetchDb() {
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  };

  const orderRes = await fetch(`${url}/sales_orders?select=*&limit=5&order=created_at.desc`, { headers });
  const orders = await orderRes.json();
  console.log('Orders:', JSON.stringify(orders.map(o => o.order_number), null, 2));
  
  // also try to find the specific order using like
  const orderRes2 = await fetch(`${url}/sales_orders?order_number=like.*1787323653830*`, { headers });
  const orders2 = await orderRes2.json();
  if (orders2.length > 0) {
     console.log('Found order:', orders2[0].id, orders2[0].order_number);
     
     const itemsRes = await fetch(`${url}/sales_order_items?sales_order_id=eq.${orders2[0].id}`, { headers });
     console.log('Items:', JSON.stringify(await itemsRes.json(), null, 2));

     const fulfillmentsRes = await fetch(`${url}/sales_order_fulfillments?sales_order_id=eq.${orders2[0].id}`, { headers });
     console.log('Fulfillments:', JSON.stringify(await fulfillmentsRes.json(), null, 2));
  }
}

fetchDb();
