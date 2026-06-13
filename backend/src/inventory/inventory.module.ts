import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [InventoryService, SupabaseAuthGuard],
})
export class InventoryModule {}
