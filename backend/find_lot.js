const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.zzfvtugsgupcclfhprji:75195346820abc@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT * FROM finished_product_lots WHERE lot_code = 'CP-2026-1786973106429-583'`);
  console.log(JSON.stringify(res.rows, null, 2));

  if (res.rows.length > 0) {
    const lotId = res.rows[0].id;
    // Check if there's any related production order
    if (res.rows[0].production_order_id) {
        const opRes = await client.query(`SELECT * FROM production_orders WHERE id = $1`, [res.rows[0].production_order_id]);
        console.log("Related Production Order:");
        console.log(JSON.stringify(opRes.rows, null, 2));
    }
  }

  await client.end();
}

run().catch(console.error);
