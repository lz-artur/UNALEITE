import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { CancelAttendanceDto } from './dto/cancel-attendance.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { FulfillSalesOrderDto } from './dto/fulfill-sales-order.dto';
import { ListSalesOrdersDto } from './dto/list-sales-orders.dto';
import { ReturnSalesOrderDto } from './dto/return-sales-order.dto';
import { SalesService } from './sales.service';

@ApiTags('sales-orders')
@ApiBearerAuth()
// @UseGuards(SupabaseAuthGuard)
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

  @Post(':id/finalize')
  finalizeConferredSalesOrder(
    @Param('id') id: string,
    @Body() payload: Omit<FulfillSalesOrderDto, 'items' | 'fulfilledAt'>,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.salesService.finalizeConferredSalesOrder(id, payload, user);
  }

  @Post(':id/attendances/:attendanceId/cancel')
  cancelAttendance(
    @Param('id') id: string,
    @Param('attendanceId') attendanceId: string,
    @Body() _payload: CancelAttendanceDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.salesService.cancelAttendance(id, attendanceId, user);
  }

  @Post(':id/return')
  returnSalesOrder(
    @Param('id') id: string,
    @Body() payload: ReturnSalesOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.salesService.returnSalesOrder(id, payload, user);
  }

  @Delete(':id')
  deleteOrder(@Param('id') id: string) {
    return this.salesService.deleteOrder(id);
  }
}
