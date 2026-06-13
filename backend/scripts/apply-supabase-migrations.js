const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.argv[2];

  if (!connectionString) {
    throw new Error('Provide DATABASE_URL as env var or first argument.');
  }

  const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      process.stdout.write(`Applying ${file}...\n`);
      await client.query(sql);
      process.stdout.write(`Applied ${file}\n`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
