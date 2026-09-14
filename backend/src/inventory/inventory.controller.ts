import { Controller, Delete, Get, Param, UseGuards, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { InventoryService } from './inventory.service';
import { CreateManualExitDto } from './dto/create-manual-exit.dto';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreateInventorySessionDto } from './dto/create-inventory-session.dto';
import { SaveInventoryCountsDto } from './dto/save-inventory-counts.dto';
import { ReviewInventoryCountDto } from './dto/review-inventory-count.dto';
import { CreateSaleExpeditionDto } from './dto/create-sale-expedition.dto';
import { CreateExpeditionWeighingDto } from './dto/create-expedition-weighing.dto';
import { CreateWarehouseWithdrawalDto } from './dto/create-warehouse-withdrawal.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Get('milk-lots')
  getMilkLots() {
    return this.inventoryService.getMilkLots();
  }

  @Get('supply-lots')
  getSupplyLots() {
    return this.inventoryService.getSupplyLots();
  }

  @Get('finished-product-lots')
  getFinishedProductLots() {
    return this.inventoryService.getFinishedProductLots();
  }

  @Delete('supply-lots/:id')
  deleteSupplyLot(@Param('id') id: string) {
    return this.inventoryService.deleteSupplyLot(id);
  }

  @Delete('finished-product-lots/:id')
  deleteFinishedProductLot(@Param('id') id: string) {
    return this.inventoryService.deleteFinishedProductLot(id);
  }

  @Post('manual-exits')
  createManualExit(
    @Body() payload: CreateManualExitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createManualExit(payload, user);
  }

  @Get('warehouse-withdrawals')
  listWarehouseWithdrawals() {
    return this.inventoryService.listWarehouseWithdrawals();
  }

  @Post('warehouse-withdrawals')
  createWarehouseWithdrawal(@Body() payload: CreateWarehouseWithdrawalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.createWarehouseWithdrawal(payload, user);
  }

  @Get('counts')
  listCountSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.listInventorySessions(user);
  }

  @Post('counts')
  createCountSession(
    @Body() payload: CreateInventorySessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createInventorySession(payload, user);
  }

  @Post('counts/:sessionId/save')
  saveCounts(
    @Param('sessionId') sessionId: string,
    @Body() payload: SaveInventoryCountsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.saveInventoryCounts(sessionId, payload, user);
  }

  @Post('counts/:sessionId/submit')
  submitCounts(
    @Param('sessionId') sessionId: string,
    @Body() payload: SaveInventoryCountsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.submitInventorySession(sessionId, payload, user);
  }

  @Post('counts/:sessionId/items/:itemId/approve')
  @UseGuards(AdminGuard)
  approveCountItem(
    @Param('sessionId') sessionId: string,
    @Param('itemId') itemId: string,
    @Body() payload: ReviewInventoryCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.approveInventoryCountItem(sessionId, itemId, payload, user);
  }

  @Post('counts/:sessionId/items/:itemId/reject')
  @UseGuards(AdminGuard)
  rejectCountItem(
    @Param('sessionId') sessionId: string,
    @Param('itemId') itemId: string,
    @Body() payload: ReviewInventoryCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.rejectInventoryCountItem(sessionId, itemId, payload, user);
  }

  @Get('counts/:sessionId')
  getCountSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.getInventorySession(sessionId, user);
  }

  @Get('expeditions')
  listExpeditions(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.listSaleExpeditions(user);
  }

  @Post('expeditions')
  createExpedition(
    @Body() payload: CreateSaleExpeditionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createSaleExpedition(payload.salesOrderId, user);
  }

  @Post('expeditions/:expeditionId/weighings')
  createExpeditionWeighing(
    @Param('expeditionId') expeditionId: string,
    @Body() payload: CreateExpeditionWeighingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.createExpeditionWeighing(expeditionId, payload, user);
  }

  @Delete('expeditions/:expeditionId/weighings/:weighingId')
  deleteExpeditionWeighing(
    @Param('expeditionId') expeditionId: string,
    @Param('weighingId') weighingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.deleteExpeditionWeighing(expeditionId, weighingId, user);
  }

  @Post('expeditions/:expeditionId/confirm')
  confirmExpedition(
    @Param('expeditionId') expeditionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.confirmSaleExpedition(expeditionId, user);
  }

  @Get('expeditions/:expeditionId')
  getExpedition(
    @Param('expeditionId') expeditionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.getSaleExpedition(expeditionId, user);
  }
}
