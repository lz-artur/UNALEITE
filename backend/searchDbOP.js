const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.zzfvtugsgupcclfhprji:75195346820abc@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  
  const tables = res.rows.map(r => r.table_name);
  let foundSomething = false;

  for (const table of tables) {
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    
    const uuidCols = colsRes.rows.filter(r => ['character varying', 'text', 'uuid'].includes(r.data_type)).map(r => r.column_name);
    
    if (uuidCols.length === 0) continue;

    const conditions = uuidCols.map(col => `"${col}"::text = '58c50aab-eb7f-46ee-93b0-164e19b16c18'`).join(' OR ');
    
    try {
      const q = `SELECT * FROM "${table}" WHERE ${conditions}`;
      const dataRes = await client.query(q);
      if (dataRes.rows.length > 0) {
        foundSomething = true;
        console.log(`\n--- Linked to Production Order in table: ${table} ---`);
        console.log(JSON.stringify(dataRes.rows, null, 2));
      }
    } catch (e) {
      // ignore
    }
  }
  
  await client.end();
}

run().catch(console.error);
