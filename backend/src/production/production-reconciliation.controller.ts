import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { ProductionService } from './production.service';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('production-reconciliation')
export class ProductionReconciliationController {
  constructor(private readonly productionService: ProductionService) {}

  @Get('milk-lots')
  listMilkLotReconciliation() {
    return this.productionService.listMilkLotReconciliation();
  }
}
