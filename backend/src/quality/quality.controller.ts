import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CreateMilkAnalysisDto } from './dto/create-milk-analysis.dto';
import { QualityService } from './quality.service';

@ApiTags('quality')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Get('milk-lot-analyses')
  listAnalyses() {
    return this.qualityService.listAnalyses();
  }

  @Get('milk-lot-pricings')
  listPricings() {
    return this.qualityService.listPricings();
  }

  @Post('milk-lots/:id/analysis')
  createAnalysis(
    @Param('id') milkLotId: string,
    @Body() payload: CreateMilkAnalysisDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.qualityService.createAnalysis(milkLotId, payload, user);
  }

  @Delete('milk-lot-analyses/:id')
  deleteAnalysis(@Param('id') id: string) {
    return this.qualityService.deleteAnalysis(id);
  }
}
