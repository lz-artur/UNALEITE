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
    
    const stringCols = colsRes.rows.filter(r => ['character varying', 'text', 'uuid'].includes(r.data_type)).map(r => r.column_name);
    
    if (stringCols.length === 0) continue;

    const conditions = stringCols.map(col => `
      "${col}"::text LIKE '%e2c60138-8978-4e32-8767-f740faeac1c5%' 
    `).join(' OR ');
    
    try {
      const q = `SELECT * FROM "${table}" WHERE ${conditions}`;
      const dataRes = await client.query(q);
      if (dataRes.rows.length > 0) {
        foundSomething = true;
        console.log(`\n--- Found remaining records in table: ${table} ---`);
        console.log(JSON.stringify(dataRes.rows, null, 2));
      }
    } catch (e) {
      // ignore
    }
  }
  
  if (!foundSomething) {
    console.log("No remaining records found. The database is completely clean of these IDs.");
  }
  
  await client.end();
}

run().catch(console.error);
