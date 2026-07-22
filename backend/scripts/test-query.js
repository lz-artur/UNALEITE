const { createClient } = require('@supabase/supabase-js');

async function main() {
  const supabase = createClient(
    'https://zzfvtugsgupcclfhprji.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZnZ0dWdzZ3VwY2NsZmhwcmppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc5ODY2OSwiZXhwIjoyMDk2Mzc0NjY5fQ.7QCKIh51puBvyh8kgPT5Hra1l7VB1mCasPPWHDONQ70'
  );

  const { data, error } = await supabase
    .from('milk_lot_analyses')
    .select('*, subanalyses:milk_lot_subanalyses(*)')
    .order('analyzed_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data.slice(0, 2), null, 2));
  }
}

main();
