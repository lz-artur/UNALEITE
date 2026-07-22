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
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already applied migrations
    const { rows } = await client.query('SELECT name FROM _migrations;');
    const appliedMigrations = new Set(rows.map((row) => row.name));

    let appliedCount = 0;

    for (const file of files) {
      if (appliedMigrations.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      process.stdout.write(`Applying ${file}...\n`);
      
      // We can run this in a transaction if needed, but for now simple query is fine
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        process.stdout.write(`Applied ${file}\n`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    if (appliedCount === 0) {
      console.log('No new migrations to apply.');
    } else {
      console.log(`Successfully applied ${appliedCount} new migration(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
