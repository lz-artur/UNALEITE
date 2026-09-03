import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import {
  CancelNfeDto,
  CertificatePasswordDto,
  CreateNfeDraftDto,
  ListNfeDto,
  UpdateNfeConfigDto,
  UpdateNfeDraftDto,
  UpdateNfeItemDto,
} from './dto/nfe.dto';
import { NfeConfigService } from './nfe-config.service';
import { NfeEmissionService } from './nfe-emission.service';
import { NfeService } from './nfe.service';

@ApiTags('nfe')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, PermissionGuard)
@Controller('nfe')
export class NfeController {
  constructor(
    private readonly nfeService: NfeService,
    private readonly configService: NfeConfigService,
    private readonly emissionService: NfeEmissionService,
  ) {}

  @Get()
  @RequirePermission('faturamento', 'view')
  list(@Query() query: ListNfeDto) { return this.nfeService.list(query); }

  @Get('eligible-orders')
  @RequirePermission('faturamento', 'create')
  eligibleOrders() { return this.nfeService.eligibleOrders(); }

  @Get('config')
  @RequirePermission('faturamento', 'view')
  getConfig() { return this.configService.getConfig(); }

  @Put('config')
  @RequirePermission('faturamento', 'configure')
  updateConfig(@Body() payload: UpdateNfeConfigDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.configService.updateConfig(payload, user);
  }

  @Post('config/certificate')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('certificate', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @RequirePermission('faturamento', 'configure')
  uploadCertificate(
    @UploadedFile() file: { buffer: Buffer; originalname?: string },
    @Body() payload: CertificatePasswordDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) { return this.configService.uploadCertificate(file, payload.password, user); }

  @Get('sefaz/status')
  @RequirePermission('faturamento', 'configure')
  sefazStatus() { return this.emissionService.status(); }

  @Post('drafts')
  @RequirePermission('faturamento', 'create')
  createDraft(@Body() payload: CreateNfeDraftDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.nfeService.createDraft(payload, user);
  }

  @Get(':id')
  @RequirePermission('faturamento', 'view')
  get(@Param('id') id: string) { return this.nfeService.get(id); }

  @Patch(':id')
  @RequirePermission('faturamento', 'edit')
  update(@Param('id') id: string, @Body() payload: UpdateNfeDraftDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.nfeService.update(id, payload, user);
  }

  @Patch(':id/items/:itemId')
  @RequirePermission('faturamento', 'edit')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() payload: UpdateNfeItemDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) { return this.nfeService.updateItem(id, itemId, payload, user); }

  @Post(':id/validate')
  @RequirePermission('faturamento', 'edit')
  validate(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.nfeService.validate(id, user);
  }

  @Post(':id/authorize')
  @RequirePermission('faturamento', 'authorize')
  authorize(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.emissionService.authorize(id, user);
  }

  @Post(':id/reconcile')
  @RequirePermission('faturamento', 'authorize')
  reconcile(@Param('id') id: string, @CurrentUser() user?: AuthenticatedUser) {
    return this.emissionService.reconcile(id, user);
  }

  @Post(':id/cancel')
  @RequirePermission('faturamento', 'cancel')
  cancel(@Param('id') id: string, @Body() payload: CancelNfeDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.emissionService.cancel(id, payload.justification, user);
  }

  @Get(':id/xml')
  @RequirePermission('faturamento', 'view')
  xml(@Param('id') id: string) { return this.emissionService.signedAssetUrl(id, 'xml'); }

  @Get(':id/danfe')
  @RequirePermission('faturamento', 'view')
  danfe(@Param('id') id: string) { return this.emissionService.signedAssetUrl(id, 'danfe'); }

  @Delete(':id')
  @RequirePermission('faturamento', 'delete')
  remove(@Param('id') id: string) { return this.nfeService.remove(id); }
}
