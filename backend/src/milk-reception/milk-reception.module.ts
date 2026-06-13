import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { MilkReceptionController } from './milk-reception.controller';
import { MilkReceptionService } from './milk-reception.service';

@Module({
  imports: [AuthModule],
  controllers: [MilkReceptionController],
  providers: [MilkReceptionService, DomainRulesService, SupabaseAuthGuard],
  exports: [MilkReceptionService],
})
export class MilkReceptionModule {}
