const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = 'postgresql://postgres.zzfvtugsgupcclfhprji:75195346820abc@aws-1-us-east-2.pooler.supabase.com:5432/postgres';
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to DB.');
    
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '014_milk_lot_subanalyses.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query(sql);
    console.log('Successfully applied 014_milk_lot_subanalyses.sql');
  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    await client.end();
  }
}

main();
