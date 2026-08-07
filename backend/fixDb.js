const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.zzfvtugsgupcclfhprji:75195346820abc@aws-1-us-east-2.pooler.supabase.com:5432/postgres',
});

async function run() {
  await client.connect();
  await client.query(`
    UPDATE milk_lots 
    SET available_volume_liters = volume_liters 
    WHERE id = 'e2c60138-8978-4e32-8767-f740faeac1c5'
  `);
  console.log('Fixed DB record');
  await client.end();
}

run().catch(console.error);
