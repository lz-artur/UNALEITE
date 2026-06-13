import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { ListReportsDto } from './dto/list-reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('production')
  getProductionReport(@Query() query: ListReportsDto) {
    return this.reportsService.getProductionReport(query);
  }

  @Get('quality')
  getQualityReport(@Query() query: ListReportsDto) {
    return this.reportsService.getQualityReport(query);
  }

  @Get('pricing')
  getPricingReport(@Query() query: ListReportsDto) {
    return this.reportsService.getPricingReport(query);
  }
}
