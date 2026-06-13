import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { ListMilkPayrollDto } from './dto/list-milk-payroll.dto';
import { MilkPayrollService } from './milk-payroll.service';

@ApiTags('milk-payroll')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('milk-payroll')
export class MilkPayrollController {
  constructor(private readonly milkPayrollService: MilkPayrollService) {}

  @Get()
  listSummary(@Query() query: ListMilkPayrollDto) {
    return this.milkPayrollService.listSummary(query);
  }

  @Get(':producerId')
  getProducerDetail(
    @Param('producerId') producerId: string,
    @Query() query: ListMilkPayrollDto,
  ) {
    return this.milkPayrollService.getProducerDetail(producerId, query);
  }
}
