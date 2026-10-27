import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersModule } from '../users/users.module';
import { DomainRulesService } from '../common/services/domain-rules.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [InventoryController],
  providers: [InventoryService, DomainRulesService, SupabaseAuthGuard, AdminGuard],
})
export class InventoryModule {}
