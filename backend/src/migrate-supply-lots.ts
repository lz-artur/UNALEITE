import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SupabaseService } from './supabase/supabase.service';
import { SUPPLY_LOT_STATUS } from './common/constants/domain';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabaseService = app.get(SupabaseService);

  console.log('Starting migration for legacy supply_items stock...');

  const { data: items, error: itemsError } = await supabaseService.admin
    .from('supply_items')
    .select('id, current_stock, default_cost, default_supplier_id')
    .gt('current_stock', 0);

  if (itemsError) {
    console.error('Error fetching items:', itemsError);
    return;
  }

  // Get a default supplier just in case
  let { data: suppliers } = await supabaseService.admin.from('suppliers').select('id').limit(1);
  let fallbackSupplierId = suppliers?.[0]?.id;

  if (!fallbackSupplierId) {
    console.log('No supplier found. Creating a dummy supplier...');
    const { data: newSupplier } = await supabaseService.admin.from('suppliers').insert({
      name: 'Fornecedor Padrão (Migração)',
      document: '00000000000000',
      active: true
    }).select('id').single();
    fallbackSupplierId = newSupplier?.id;
  }

  // Get a default location just in case
  let { data: locations } = await supabaseService.admin.from('stock_locations').select('id').limit(1);
  let fallbackLocationId = locations?.[0]?.id;

  if (!fallbackLocationId) {
    console.log('No location found. Creating a dummy location...');
    const { data: newLoc } = await supabaseService.admin.from('stock_locations').insert({
      name: 'Estoque Padrão (Migração)',
      active: true,
      stock_type: 'Insumos'
    }).select('id').single();
    fallbackLocationId = newLoc?.id;
  }

  console.log(`Found ${items.length} items with stock > 0.`);

  let createdCount = 0;

  for (const item of items) {
    const { data: lots, error: lotsError } = await supabaseService.admin
      .from('supply_lots')
      .select('id')
      .eq('supply_item_id', item.id)
      .limit(1);

    if (lotsError) {
      console.error(`Error fetching lots for item ${item.id}:`, lotsError);
      continue;
    }

    if (!lots || lots.length === 0) {
      const supplierId = item.default_supplier_id || fallbackSupplierId;
      console.log(`Creating ESTOQUE INICIAL lot for item ${item.id} with stock ${item.current_stock}...`);
      
      const { error: insertError } = await supabaseService.admin
        .from('supply_lots')
        .insert({
          supply_item_id: item.id,
          internal_lot_code: `ESTOQUE INICIAL - ${item.id}`,
          entry_date: new Date().toISOString(),
          received_quantity: item.current_stock,
          available_quantity: item.current_stock,
          unit_cost: item.default_cost || 0,
          total_value: Number(item.current_stock) * Number(item.default_cost || 0),
          status: SUPPLY_LOT_STATUS.AVAILABLE,
          supplier_id: supplierId,
          location_id: fallbackLocationId,
          created_by: null,
          updated_by: null,
        });

      if (insertError) {
        console.error(`Failed to create lot for item ${item.id}:`, insertError);
      } else {
        createdCount++;
      }
    } else {
       console.log(`Item ${item.id} already has lots. Skipping...`);
    }
  }

  console.log(`Migration completed. Created ${createdCount} lots.`);
  await app.close();
}

bootstrap();
