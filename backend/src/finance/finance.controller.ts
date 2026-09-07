import { Body, Controller, Get, Param, Post, Put, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { FinanceService } from './finance.service';
import { ListFinancialEntriesDto } from './dto/list-financial-entries.dto';
import { SettleFinancialEntryDto } from './dto/settle-financial-entry.dto';
import { CreateFinancialReceiptDto } from './dto/create-financial-receipt.dto';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('financial-entries')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get()
  listEntries(@Query() query: ListFinancialEntriesDto) {
    return this.financeService.listEntries(query);
  }

  @Post()
  createEntry(
    @Body() payload: any,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.createEntry(payload, user);
  }

  @Post(':id/settle')
  settleEntry(
    @Param('id') id: string,
    @Body() payload: SettleFinancialEntryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.settleEntry(id, payload, user);
  }

  @Post(':id/receipts')
  createReceipt(
    @Param('id') id: string,
    @Body() payload: CreateFinancialReceiptDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.createReceipt(id, payload, user);
  }

  @Delete(':id/receipts/:receiptId')
  deleteReceipt(
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.deleteReceipt(id, receiptId, user);
  }

  @Post(':id/unsettle')
  unsettleEntry(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.unsettleEntry(id, user);
  }

  @Post('batch')
  createBatchEntries(
    @Body() payloads: any[],
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.createBatchEntries(payloads, user);
  }

  @Get(':id')
  getEntry(@Param('id') id: string) {
    return this.financeService.getEntry(id);
  }

  @Put(':id')
  updateEntry(
    @Param('id') id: string,
    @Body() payload: any,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.updateEntry(id, payload, user);
  }

  @Delete(':id')
  deleteEntry(@Param('id') id: string) {
    return this.financeService.deleteEntry(id);
  }
}
