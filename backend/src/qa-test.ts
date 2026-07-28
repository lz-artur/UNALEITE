import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SupabaseService } from './supabase/supabase.service';
import { ProductionService } from './production/production.service';
import * as crypto from 'crypto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabaseService = app.get(SupabaseService);
  const productionService = app.get(ProductionService);

  let mockProductId = '';

  console.log('--- Starting QA Test for Production Service ---');

  try {
    // 1. Fetch Existing Valid Data
    console.log('Fetching existing valid data from DB...');

    // Find a milk lot with available volume (we know this exists from previous runs)
    const { data: milkLot } = await supabaseService.admin.from('milk_lots')
      .select('id')
      .gt('available_volume_liters', 0)
      .limit(1)
      .single();
    if (!milkLot) throw new Error('No available milk_lots found.');

    // Find a finished product that has an active product_spec
    const { data: spec } = await supabaseService.admin.from('product_specs')
      .select('product_id')
      .eq('active', true)
      .limit(1)
      .single();
    if (!spec) throw new Error('No active product_specs found in database. Seed data must be present.');

    mockProductId = spec.product_id;

    // Ensure the product is active for the test
    await supabaseService.admin.from('finished_products').update({ active: true }).eq('id', mockProductId);

    // Find a supply lot with available quantity
    const { data: supplyLot } = await supabaseService.admin.from('supply_lots')
      .select('id, supply_item_id, available_quantity')
      .gt('available_quantity', 10)
      .limit(1)
      .single();
    if (!supplyLot) throw new Error('No available supply_lots found.');

    const mockMilkLotId = milkLot.id;
    const mockSupplyLotId = supplyLot.id;
    const mockSupplyItemId = supplyLot.supply_item_id;

    // Get initial stock
    const { data: initialLot } = await supabaseService.admin.from('supply_lots').select('available_quantity').eq('id', mockSupplyLotId).single();
    const { data: initialItem } = await supabaseService.admin.from('supply_items').select('current_stock').eq('id', mockSupplyItemId).single();
    const initialLotQty = Number(initialLot!.available_quantity);
    const initialItemQty = Number(initialItem!.current_stock);

    // 2. Test createOrder
    console.log('Testing createOrder...');
    const createPayload = {
      productId: mockProductId,
      milkLotId: mockMilkLotId,
      litersToUse: 50,
      supplyConsumptions: [
        { supplyLotId: mockSupplyLotId, quantity: 2 }
      ]
    };
    const orderCreated = await productionService.createOrder(createPayload as any);
    const orderId = orderCreated.order.id;

    // Verify stock deducted
    let { data: lotAfterCreate } = await supabaseService.admin.from('supply_lots').select('available_quantity').eq('id', mockSupplyLotId).single();
    let { data: itemAfterCreate } = await supabaseService.admin.from('supply_items').select('current_stock').eq('id', mockSupplyItemId).single();

    if (Number(lotAfterCreate!.available_quantity) !== initialLotQty - 2 || Number(itemAfterCreate!.current_stock) !== initialItemQty - 2) {
      throw new Error(`QA Failed: Stock not deducted on createOrder.`);
    }
    console.log('Stock correctly deducted on createOrder.');

    // 3. Test updateOrder
    console.log('Testing updateOrder...');
    const updatePayload = {
      supplyConsumptions: [
        { supplyLotId: mockSupplyLotId, quantity: 3 }
      ]
    };
    await productionService.updateOrder(orderId, updatePayload as any);

    let { data: lotAfterUpdate } = await supabaseService.admin.from('supply_lots').select('available_quantity').eq('id', mockSupplyLotId).single();
    let { data: itemAfterUpdate } = await supabaseService.admin.from('supply_items').select('current_stock').eq('id', mockSupplyItemId).single();

    if (Number(lotAfterUpdate!.available_quantity) !== initialLotQty - 3 || Number(itemAfterUpdate!.current_stock) !== initialItemQty - 3) {
      throw new Error(`QA Failed: Stock not correctly adjusted on updateOrder.`);
    }
    console.log('Stock correctly adjusted on updateOrder.');

    // 4. Test completeOrder
    console.log('Testing completeOrder...');
    const completePayload = {
      actualQuantityProduced: 10,
      supplyConsumptions: [
        { supplyLotId: mockSupplyLotId, quantity: 3 }
      ]
    };
    await productionService.completeOrder(orderId, completePayload as any);

    let { data: lotAfterComplete } = await supabaseService.admin.from('supply_lots').select('available_quantity').eq('id', mockSupplyLotId).single();
    let { data: itemAfterComplete } = await supabaseService.admin.from('supply_items').select('current_stock').eq('id', mockSupplyItemId).single();

    if (Number(lotAfterComplete!.available_quantity) !== initialLotQty - 3 || Number(itemAfterComplete!.current_stock) !== initialItemQty - 3) {
      throw new Error(`QA Failed: completeOrder caused double deduction.`);
    }
    console.log('Stock maintained correctly on completeOrder (no double deduction).');

    // Clean up order explicitly
    await productionService.deleteOrder(orderId);
    console.log('Order deleted successfully.');

    // Verify stock restored
    let { data: lotAfterDelete } = await supabaseService.admin.from('supply_lots').select('available_quantity').eq('id', mockSupplyLotId).single();
    if (Number(lotAfterDelete!.available_quantity) !== initialLotQty) {
      throw new Error(`QA Failed: Stock not restored on deleteOrder.`);
    }
    console.log('Stock restored on deleteOrder.');

    console.log('--- All QA Tests Passed Successfully ---');
    process.exit(0);

  } catch (err) {
    console.error('QA Test Failed:', err);
    process.exit(1);
  } finally {
    console.log('Test completed.');
    await app.close();
  }
}

bootstrap();
