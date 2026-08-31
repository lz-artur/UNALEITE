import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { BankAccountsService } from './bank-accounts.service';

@ApiTags('bank-accounts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  listAccounts() {
    return this.bankAccountsService.listAccounts();
  }

  @Post()
  createAccount(
    @Body() payload: any,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.bankAccountsService.createAccount(payload, user);
  }

  @Post('transfer')
  transferFunds(
    @Body() payload: any,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.bankAccountsService.transferFunds(payload, user);
  }

  @Get(':id')
  getAccount(@Param('id') id: string) {
    return this.bankAccountsService.getAccount(id);
  }

  @Put(':id')
  updateAccount(
    @Param('id') id: string,
    @Body() payload: any,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.bankAccountsService.updateAccount(id, payload, user);
  }

  @Get(':id/statement')
  getAccountStatement(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.bankAccountsService.getAccountStatement(id, { startDate, endDate });
  }
}
