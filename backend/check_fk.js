const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.zzfvtugsgupcclfhprji:75195346820abc@aws-1-us-east-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='financial_entries';
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
