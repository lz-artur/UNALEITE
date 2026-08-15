const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://zzfvtugsgupcclfhprji.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6ZnZ0dWdzZ3VwY2NsZmhwcmppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDc5ODY2OSwiZXhwIjoyMDk2Mzc0NjY5fQ.7QCKIh51puBvyh8kgPT5Hra1l7VB1mCasPPWHDONQ70');

async function run() {
  const { error } = await supabase
    .from('financial_entries')
    .delete()
    .eq('id', '0595325b-3c48-421f-b5a7-e27a5d5eaa72');
  if (error) console.error(error);
  else console.log('Successfully deleted record 0595325b-3c48-421f-b5a7-e27a5d5eaa72');
}
run();
