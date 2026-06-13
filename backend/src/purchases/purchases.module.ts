import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [AuthModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, SupabaseAuthGuard],
})
export class PurchasesModule {}
