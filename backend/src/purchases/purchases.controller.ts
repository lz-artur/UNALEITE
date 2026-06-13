import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ListPurchasesDto } from './dto/list-purchases.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  listPurchases(@Query() query: ListPurchasesDto) {
    return this.purchasesService.listPurchases(query);
  }

  @Get(':id')
  getPurchase(@Param('id') id: string) {
    return this.purchasesService.getPurchase(id);
  }

  @Post()
  createPurchase(
    @Body() payload: CreatePurchaseDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.purchasesService.createPurchase(payload, user);
  }

  @Post(':id/receive')
  receivePurchase(
    @Param('id') id: string,
    @Body() payload: ReceivePurchaseDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.purchasesService.receivePurchase(id, payload, user);
  }
}
