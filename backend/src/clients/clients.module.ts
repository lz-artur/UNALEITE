import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService, SupabaseAuthGuard],
  exports: [ClientsService],
})
export class ClientsModule {}
