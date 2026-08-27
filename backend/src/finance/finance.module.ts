import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';

@Module({
  imports: [AuthModule],
  controllers: [FinanceController, BankAccountsController],
  providers: [FinanceService, BankAccountsService, SupabaseAuthGuard],
})
export class FinanceModule {}
