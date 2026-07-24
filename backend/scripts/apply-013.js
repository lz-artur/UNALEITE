const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.argv[2];

  if (!connectionString) {
    throw new Error('Provide DATABASE_URL as first argument.');
  }

  const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
  
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    const file = '013_payment_and_purchases.sql';
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    process.stdout.write(`Applying ${file}...\n`);
    await client.query(sql);
    process.stdout.write(`Applied ${file}\n`);
    
    // Reload schema cache
    process.stdout.write(`Reloading PostgREST schema cache...\n`);
    await client.query(`NOTIFY pgrst, 'reload schema'`);
    process.stdout.write(`Schema cache reloaded successfully.\n`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
