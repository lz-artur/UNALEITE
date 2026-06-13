import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductionController],
  providers: [ProductionService, DomainRulesService, SupabaseAuthGuard],
})
export class ProductionModule {}
