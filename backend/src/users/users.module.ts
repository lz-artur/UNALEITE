import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, SupabaseAuthGuard, AdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
