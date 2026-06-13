import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { FinanceService } from './finance.service';
import { ListFinancialEntriesDto } from './dto/list-financial-entries.dto';
import { SettleFinancialEntryDto } from './dto/settle-financial-entry.dto';

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

  @Post(':id/settle')
  settleEntry(
    @Param('id') id: string,
    @Body() payload: SettleFinancialEntryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.financeService.settleEntry(id, payload, user);
  }
}
