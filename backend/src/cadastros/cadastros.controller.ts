import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { ListQueryDto } from '../common/dto/list-query.dto';
import type { CadastroEntity } from '../common/constants/cadastro-entities';
import { CadastrosService } from './cadastros.service';

@ApiTags('cadastros')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('cadastros')
export class CadastrosController {
  constructor(private readonly cadastrosService: CadastrosService) {}

  @Get(':entity')
  list(@Param('entity') entity: CadastroEntity, @Query() query: ListQueryDto) {
    return this.cadastrosService.list(entity, query);
  }

  @Get(':entity/:id')
  getById(@Param('entity') entity: CadastroEntity, @Param('id') id: string) {
    return this.cadastrosService.getById(entity, id);
  }

  @Post(':entity')
  create(
    @Param('entity') entity: CadastroEntity,
    @Body() payload: Record<string, unknown>,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.cadastrosService.create(entity, payload, user);
  }

  @Patch(':entity/:id')
  update(
    @Param('entity') entity: CadastroEntity,
    @Param('id') id: string,
    @Body() payload: Record<string, unknown>,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.cadastrosService.update(entity, id, payload, user);
  }

  @Post(':entity/:id/toggle-active')
  toggleActive(
    @Param('entity') entity: CadastroEntity,
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.cadastrosService.toggleActive(entity, id, user);
  }

  @Delete(':entity/:id')
  delete(
    @Param('entity') entity: CadastroEntity,
    @Param('id') id: string,
  ) {
    return this.cadastrosService.delete(entity, id);
  }
}
