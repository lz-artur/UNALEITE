import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { ProductionController } from './production.controller';
import { ProductionReconciliationController } from './production-reconciliation.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [ProductionController, ProductionReconciliationController],
  providers: [ProductionService, DomainRulesService, SupabaseAuthGuard],
})
export class ProductionModule {}
