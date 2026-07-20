import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { InventoryService } from './inventory.service';

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
}
