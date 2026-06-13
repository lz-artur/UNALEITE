import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({
  imports: [AuthModule],
  controllers: [QualityController],
  providers: [QualityService, DomainRulesService, SupabaseAuthGuard],
})
export class QualityModule {}
