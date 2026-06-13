import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [AuthModule],
  controllers: [FinanceController],
  providers: [FinanceService, SupabaseAuthGuard],
})
export class FinanceModule {}
