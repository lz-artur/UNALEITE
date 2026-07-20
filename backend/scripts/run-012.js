const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = process.argv[2] || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('Error: Provide DATABASE_URL as env var or first argument.');
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const sqlPath = path.join(__dirname, '../supabase/migrations/012_commercial_updates.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  try {
    console.log('Applying 012_commercial_updates.sql...');
    await client.query(sql);
    console.log('Successfully applied 012_commercial_updates.sql');
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
