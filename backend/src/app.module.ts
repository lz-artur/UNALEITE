import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CadastrosModule } from './cadastros/cadastros.module';
import { ClientsModule } from './clients/clients.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FinanceModule } from './finance/finance.module';
import { InventoryModule } from './inventory/inventory.module';
import { MilkReceptionModule } from './milk-reception/milk-reception.module';
import { MilkPayrollModule } from './milk-payroll/milk-payroll.module';
import { ProductionModule } from './production/production.module';
import { PurchasesModule } from './purchases/purchases.module';
import { QualityModule } from './quality/quality.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    SupabaseModule,
    AuthModule,
    ClientsModule,
    CadastrosModule,
    MilkReceptionModule,
    MilkPayrollModule,
    PurchasesModule,
    SalesModule,
    QualityModule,
    ProductionModule,
    InventoryModule,
    FinanceModule,
    DashboardModule,
    ReportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
