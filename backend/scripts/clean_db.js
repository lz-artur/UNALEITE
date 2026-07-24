require('dotenv').config();
const { Client } = require('pg');

async function bootstrap() {
  console.log('Starting Database Cleanup for Production...');
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to PostgreSQL.');

  try {
    await client.query('BEGIN');

    console.log('Truncating transactional tables...');
    await client.query(`
      TRUNCATE 
        sales_order_fulfillments,
        sales_order_items,
        sales_orders,
        purchase_items,
        purchases,
        stock_movements,
        financial_entries,
        lot_block_events,
        finished_product_lots,
        production_order_supply_consumptions,
        production_order_milk_consumptions,
        production_orders,
        milk_lot_pricing,
        milk_lot_analyses,
        milk_lots,
        milk_receptions,
        supply_lots
      CASCADE;
    `);

    console.log('Unlinking routes from preserved producers...');
    await client.query(`
      UPDATE producers 
      SET route_id = NULL 
      WHERE name ILIKE '%ADRIANO%' OR name ILIKE '%LUCIO%';
    `);

    console.log('Deleting test producers...');
    const delProducers = await client.query(`
      DELETE FROM producers 
      WHERE name NOT ILIKE '%ADRIANO%' AND name NOT ILIKE '%LUCIO%';
    `);
    console.log(`Deleted ${delProducers.rowCount} test producers.`);

    console.log('Deleting routes...');
    const delRoutes = await client.query(`DELETE FROM routes;`);
    console.log(`Deleted ${delRoutes.rowCount} routes.`);

    console.log('Deleting transporters...');
    const delTransporters = await client.query(`DELETE FROM transporters;`);
    console.log(`Deleted ${delTransporters.rowCount} transporters.`);

    await client.query('COMMIT');
    console.log('✅ Cleanup completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during cleanup, rolled back transaction:', error);
  } finally {
    await client.end();
  }
}

bootstrap();
