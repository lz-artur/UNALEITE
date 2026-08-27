const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const categories = [
    { name: 'Saldo Inicial', entry_type: 'Receber', show_in_dre: false },
    { name: 'Transferência entre Contas', entry_type: 'Transferência', show_in_dre: false }
  ];

  for (const cat of categories) {
    const { data, error } = await supabase
      .from('accounting_categories')
      .select('id')
      .eq('name', cat.name)
      .maybeSingle();

    if (error) {
      console.error('Error checking category:', cat.name, error);
      continue;
    }

    if (!data) {
      console.log(`Inserting category: ${cat.name}`);
      const { error: insertError } = await supabase
        .from('accounting_categories')
        .insert([cat]);
      if (insertError) {
        console.error('Failed to insert:', cat.name, insertError);
      } else {
        console.log(`Inserted successfully: ${cat.name}`);
      }
    } else {
      console.log(`Category already exists: ${cat.name}`);
    }
  }
}

main();
