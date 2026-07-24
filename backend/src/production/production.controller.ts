import { Body, Controller, Delete, Get, Param, Post, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CompleteProductionOrderDto } from './dto/complete-production-order.dto';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { ProductionService } from './production.service';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('production-orders')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get()
  listOrders() {
    return this.productionService.listOrders();
  }

  @Post()
  createOrder(
    @Body() payload: CreateProductionOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productionService.createOrder(payload, user);
  }

  @Post(':id/complete')
  completeOrder(
    @Param('id') orderId: string,
    @Body() payload: CompleteProductionOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productionService.completeOrder(orderId, payload, user);
  }

  @Patch(':id')
  updateOrder(
    @Param('id') orderId: string,
    @Body() payload: UpdateProductionOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.productionService.updateOrder(orderId, payload, user);
  }

  @Delete(':id')
  deleteOrder(@Param('id') id: string) {
    return this.productionService.deleteOrder(id);
  }
}
