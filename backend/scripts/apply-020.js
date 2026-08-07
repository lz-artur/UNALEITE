const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required.');
    console.error('Usage: DATABASE_URL="postgresql://..." node scripts/apply-020.js');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to DB.');

    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '020_user_roles_permissions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await client.query(sql);
    console.log('Successfully applied 020_user_roles_permissions.sql');
  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    await client.end();
  }
}

main();
