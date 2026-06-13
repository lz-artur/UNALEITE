import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CadastrosController } from './cadastros.controller';
import { CadastrosService } from './cadastros.service';

@Module({
  imports: [AuthModule],
  controllers: [CadastrosController],
  providers: [CadastrosService, SupabaseAuthGuard],
  exports: [CadastrosService],
})
export class CadastrosModule {}
