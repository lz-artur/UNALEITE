import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CadastrosService } from '../src/cadastros/cadastros.service';
import { MilkReceptionService } from '../src/milk-reception/milk-reception.service';

async function bootstrap() {
  console.log('Starting QA Test Runner against Production Database...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const cadastrosService = app.get(CadastrosService);
  const milkReceptionService = app.get(MilkReceptionService);
  
  try {
    // 1. Test Cadastros: paymentTypes
    console.log('\n--- Testing Cadastros (paymentTypes) ---');
    const paymentTypes = await cadastrosService.list('paymentTypes', {});
    console.log(`Success! Found ${paymentTypes.length || (paymentTypes as any).data?.length || 0} payment types.`);
    
    // 2. Test Cadastros: paymentMethods
    console.log('\n--- Testing Cadastros (paymentMethods) ---');
    const paymentMethods = await cadastrosService.list('paymentMethods', {});
    console.log(`Success! Found ${paymentMethods.length || (paymentMethods as any).data?.length || 0} payment methods.`);

    // 4. Test Registration: QA Producer
    console.log('\n--- Testing Registration (producers) ---');
    const newProducerPayload = {
      name: 'QA_PRODUCER_TEST_' + Date.now(),
      document: Date.now().toString(),
      code: 'QA-' + Math.floor(Math.random() * 1000),
      farm_name: 'QA Farm Name',
      phone: '11999999999',
    };
    const createdProducer = await cadastrosService.create('producers', newProducerPayload);
    console.log(`Success! QA Producer created with ID: ${createdProducer.id}`);
    
    // Test update
    console.log(`Testing PUT/PATCH for QA Producer ${createdProducer.id}...`);
    const updatedProducer = await cadastrosService.update('producers', createdProducer.id, {
      name: newProducerPayload.name + '_UPDATED'
    });
    console.log(`Success! QA Producer updated. New Name: ${updatedProducer.name}`);

    // Prerequisites for Milk Reception
    console.log('\n--- Creating Prerequisites for Reception ---');
    const newRoute = await cadastrosService.create('routes', {
      code: 'QA-R' + Math.floor(Math.random() * 1000),
      name: 'QA Route',
      region: 'QA Region'
    });
    console.log(`Success! QA Route created with ID: ${newRoute.id}`);

    const newTransporter = await cadastrosService.create('transporters', {
      name: 'QA Transporter',
      document: (Date.now() + 1).toString(),
      driver_name: 'QA Driver',
      vehicle_plate: 'QAT-1234'
    });
    console.log(`Success! QA Transporter created with ID: ${newTransporter.id}`);

    // 5. Test Milk Reception
    console.log('\n--- Testing Milk Reception (POST) ---');
    const newReceptionPayload = {
      producerId: createdProducer.id,
      routeId: newRoute.id,
      transporterId: newTransporter.id,
      volumeLiters: 100,
      temperatura: 4.0,
      receivedAt: new Date().toISOString(),
      carPlate: 'QAT-1234',
      driverName: 'QA Driver'
    };
    const createdReception = await milkReceptionService.createReception(newReceptionPayload as any);
    console.log(`Success! QA Milk Reception created with ID: ${createdReception.reception.id}`);
    
    // 6. Clean up
    console.log('\n--- Cleaning up QA Records ---');
    await milkReceptionService.deleteReception(createdReception.reception.id);
    console.log('QA Reception deleted.');
    
    await cadastrosService.delete('producers', createdProducer.id);
    console.log('QA Producer deleted.');

    await cadastrosService.delete('transporters', newTransporter.id);
    console.log('QA Transporter deleted.');

    await cadastrosService.delete('routes', newRoute.id);
    console.log('QA Route deleted.');
    
    console.log('\n✅ All QA Tests Passed Successfully!');
  } catch (error) {
    console.error('\n❌ QA Test Failed:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
