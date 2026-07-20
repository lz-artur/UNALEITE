import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { FulfillSalesOrderDto } from './dto/fulfill-sales-order.dto';
import { ListSalesOrdersDto } from './dto/list-sales-orders.dto';
import { SalesService } from './sales.service';

@ApiTags('sales-orders')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('sales-orders')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  listSalesOrders(@Query() query: ListSalesOrdersDto) {
    return this.salesService.listSalesOrders(query);
  }

  @Get(':id')
  getSalesOrder(@Param('id') id: string) {
    return this.salesService.getSalesOrder(id);
  }

  @Post()
  createSalesOrder(
    @Body() payload: CreateSalesOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.salesService.createSalesOrder(payload, user);
  }

  @Post(':id/fulfill')
  fulfillSalesOrder(
    @Param('id') id: string,
    @Body() payload: FulfillSalesOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.salesService.fulfillSalesOrder(id, payload, user);
  }

  @Delete(':id')
  deleteOrder(@Param('id') id: string) {
    return this.salesService.deleteOrder(id);
  }
}
