const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.zzfvtugsgupcclfhprji:75195346820abc@aws-1-us-east-2.pooler.supabase.com:5432/postgres' });
client.connect().then(async () => {
  const analysisId = 'f93e3717-0187-42f5-825b-7490d2a5c2cb';
  const lotId = '8c20e3cf-23f9-49fe-a3eb-08f9f58a7cc0';
  
  await client.query('UPDATE milk_lot_analyses SET approved = true WHERE id = $1', [analysisId]);
  await client.query('UPDATE milk_lot_subanalyses SET approved = true WHERE milk_lot_analysis_id = $1', [analysisId]);
  await client.query('UPDATE milk_lots SET status = $1 WHERE id = $2', ['Aprovado', lotId]);
  
  console.log('Update successful');
  client.end();
}).catch(console.error);
