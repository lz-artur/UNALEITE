import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';

@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('auth')
export class AuthController {
  @Get('me')
  me(@CurrentUser() user: unknown) {
    return user;
  }
}
