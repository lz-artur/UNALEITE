import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CreateMilkReceptionDto } from './dto/create-milk-reception.dto';
import { UpdateMilkReceptionDto } from './dto/update-milk-reception.dto';
import { MilkReceptionService } from './milk-reception.service';

@ApiTags('milk-receptions')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class MilkReceptionController {
  constructor(private readonly milkReceptionService: MilkReceptionService) {}

  @Get('milk-receptions')
  listReceptions() {
    return this.milkReceptionService.listReceptions();
  }

  @Post('milk-receptions')
  createReception(
    @Body() payload: CreateMilkReceptionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.milkReceptionService.createReception(payload, user);
  }

  @Post('milk-lots/:id/reception')
  updateReception(
    @Param('id') id: string,
    @Body() payload: UpdateMilkReceptionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.milkReceptionService.updateReception(id, payload, user);
  }

  @Get('milk-lots')
  listMilkLots() {
    return this.milkReceptionService.listMilkLots();
  }

  @Get('milk-lots/:id')
  getMilkLot(@Param('id') id: string) {
    return this.milkReceptionService.getMilkLot(id);
  }

  @Delete('milk-lots/:id')
  deleteReception(@Param('id') id: string) {
    return this.milkReceptionService.deleteReception(id);
  }
}
