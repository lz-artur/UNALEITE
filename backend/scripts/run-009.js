const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('No DB url');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '009_add_financial_fields.sql'), 'utf8');
    await client.query(sql);
    console.log('Applied 009');
  } finally {
    await client.end();
  }
}

main().catch(console.error);
