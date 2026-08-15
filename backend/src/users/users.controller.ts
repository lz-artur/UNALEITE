import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get the current user's profile and permissions.
   * Accessible by any authenticated user.
   */
  @Get('me')
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMyProfile(user);
  }

  /**
   * List all users. Admin only.
   */
  @Get()
  @UseGuards(AdminGuard)
  listUsers() {
    return this.usersService.listUsers();
  }

  /**
   * Get user details with permissions. Admin only.
   */
  @Get(':id')
  @UseGuards(AdminGuard)
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  /**
   * Update user (role, display_name, active). Admin only.
   */
  @Patch(':id')
  @UseGuards(AdminGuard)
  updateUser(
    @Param('id') id: string,
    @Body() payload: { role?: string; display_name?: string; active?: boolean },
  ) {
    return this.usersService.updateUser(id, payload);
  }

  /**
   * Update user password. Admin only.
   */
  @Patch(':id/password')
  @UseGuards(AdminGuard)
  updatePassword(
    @Param('id') id: string,
    @Body() payload: { password: string },
  ) {
    return this.usersService.updatePassword(id, payload.password);
  }

  /**
   * Create a new user. Admin only.
   */
  @Post()
  @UseGuards(AdminGuard)
  createUser(
    @Body()
    payload: {
      email: string;
      password: string;
      display_name?: string;
      role: 'admin' | 'operacional';
    },
  ) {
    return this.usersService.createUser(payload);
  }

  /**
   * Get permissions for a specific user. Admin only.
   */
  @Get(':id/permissions')
  @UseGuards(AdminGuard)
  getPermissions(@Param('id') id: string) {
    return this.usersService.getPermissions(id);
  }

  /**
   * Set permissions for a user (batch replace). Admin only.
   */
  @Put(':id/permissions')
  @UseGuards(AdminGuard)
  setPermissions(
    @Param('id') id: string,
    @Body()
    body: {
      permissions: Array<{
        page_key: string;
        can_view: boolean;
        can_create: boolean;
        can_edit: boolean;
        can_delete: boolean;
      }>;
    },
  ) {
    return this.usersService.setPermissions(id, body.permissions);
  }
}
