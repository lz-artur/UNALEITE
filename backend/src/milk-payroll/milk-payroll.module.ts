import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { MilkPayrollController } from './milk-payroll.controller';
import { MilkPayrollService } from './milk-payroll.service';

@Module({
  imports: [AuthModule],
  controllers: [MilkPayrollController],
  providers: [MilkPayrollService, SupabaseAuthGuard],
})
export class MilkPayrollModule {}
