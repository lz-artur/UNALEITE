import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule } from '../clients/clients.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AuthModule, ClientsModule],
  controllers: [SalesController],
  providers: [SalesService, DomainRulesService, SupabaseAuthGuard],
})
export class SalesModule {}
