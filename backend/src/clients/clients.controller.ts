import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  listClients(@Query() query: ListClientsDto) {
    return this.clientsService.listClients(query);
  }

  @Get(':id')
  getClient(@Param('id') id: string) {
    return this.clientsService.getClient(id);
  }

  @Post()
  createClient(
    @Body() payload: CreateClientDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.clientsService.createClient(payload, user);
  }

  @Patch(':id')
  updateClient(
    @Param('id') id: string,
    @Body() payload: UpdateClientDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.clientsService.updateClient(id, payload, user);
  }
}
