import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { UsersModule } from '../users/users.module';
import { NfeController } from './nfe.controller';
import { NfeConfigService } from './nfe-config.service';
import { NfeEmissionService } from './nfe-emission.service';
import { NfeSefazService } from './nfe-sefaz.service';
import { NfeValidationService } from './nfe-validation.service';
import { NfeService } from './nfe.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [NfeController],
  providers: [SupabaseAuthGuard, PermissionGuard, NfeConfigService, NfeValidationService, NfeService, NfeSefazService, NfeEmissionService],
  exports: [NfeService],
})
export class NfeModule {}
