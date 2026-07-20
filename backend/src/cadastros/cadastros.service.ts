import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ListQueryDto } from '../common/dto/list-query.dto';
import {
  CADASTRO_ENTITY_DEFINITIONS,
  type CadastroEntity,
} from '../common/constants/cadastro-entities';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class CadastrosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(entity: CadastroEntity, query: ListQueryDto) {
    const definition = this.getDefinition(entity);
    let builder: any = this.supabaseService.admin
      .from(definition.table)
      .select(this.getSelectClause(entity));

    if (definition.activeColumn && query.activeOnly === 'true') {
      builder = builder.eq(definition.activeColumn, true);
    }

    if (query.search) {
      builder = this.applySearch(builder, definition.searchableColumns, query.search);
    }

    const { data, error } = await builder.order(definition.orderBy, {
      ascending: true,
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async getById(entity: CadastroEntity, id: string) {
    const definition = this.getDefinition(entity);
    const { data, error } = await this.supabaseService.admin
      .from(definition.table)
      .select(this.getSelectClause(entity))
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException(`${entity} record not found`);
    }

    return data;
  }

  async create(
    entity: CadastroEntity,
    payload: Record<string, unknown>,
    user?: AuthenticatedUser,
  ) {
    const definition = this.getDefinition(entity);
    const sanitized = this.withAudit(payload, user, true);

    const data = await this.persistEntity(definition.table, entity, sanitized, undefined);

    return data;
  }

  async update(
    entity: CadastroEntity,
    id: string,
    payload: Record<string, unknown>,
    user?: AuthenticatedUser,
  ) {
    const definition = this.getDefinition(entity);
    const sanitized = this.withAudit(payload, user, false);

    const data = await this.persistEntity(definition.table, entity, sanitized, id);

    if (!data) {
      throw new NotFoundException(`${entity} record not found`);
    }

    return data;
  }

  async toggleActive(entity: CadastroEntity, id: string, user?: AuthenticatedUser) {
    const definition = this.getDefinition(entity);

    if (!definition.activeColumn) {
      throw new BadRequestException(`${entity} does not support active flag`);
    }

    const current = await this.getById(entity, id);

    const currentAny = current as any;

    return this.update(
      entity,
      id,
      {
        [definition.activeColumn]: !currentAny[definition.activeColumn],
      },
      user,
    );
  }

  async delete(entity: CadastroEntity, id: string) {
    const definition = this.getDefinition(entity);

    if (entity === 'productSpecs') {
      await this.supabaseService.admin.from('product_spec_items').delete().eq('product_spec_id', id);
    }

    const { error } = await this.supabaseService.admin
      .from(definition.table)
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') {
        throw new BadRequestException('Não é possível excluir este registro pois ele está vinculado a outros dados no sistema.');
      }
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private getDefinition(entity: CadastroEntity) {
    const definition = CADASTRO_ENTITY_DEFINITIONS[entity];

    if (!definition) {
      throw new BadRequestException(`Unsupported cadastro entity: ${entity}`);
    }

    return definition;
  }

  private getSelectClause(entity: CadastroEntity) {
    if (entity === 'productSpecs') {
      return '*, product_spec_items(*)';
    }

    return '*';
  }

  private applySearch(
    builder: any,
    columns: string[],
    search: string,
  ) {
    const encoded = columns.map((column) => `${column}.ilike.%${search}%`).join(',');
    return builder.or(encoded);
  }

  private withAudit(
    payload: Record<string, unknown>,
    user: AuthenticatedUser | undefined,
    isCreate: boolean,
  ) {
    const next: Record<string, unknown> = { ...payload };
    const userId = user?.id ?? null;

    if (isCreate) {
      next.created_by = userId;
    }

    next.updated_by = userId;
    return next;
  }

  private async persistEntity(
    table: string,
    entity: CadastroEntity,
    payload: Record<string, unknown>,
    id?: string,
  ) {
    switch (entity) {
      case 'routes':
        return this.persistRoute(table, payload, id);
      case 'suppliers':
        return this.persistSupplier(table, payload, id);
      case 'productSpecs':
        return this.persistProductSpec(table, payload, id);
      default:
        return this.persistPlain(table, payload, id);
    }
  }

  private async persistPlain(
    table: string,
    payload: Record<string, unknown>,
    id?: string,
  ) {
    const query = id
      ? this.supabaseService.admin.from(table).update(payload).eq('id', id)
      : this.supabaseService.admin.from(table).insert(payload);

    const { data, error } = await query.select('*').maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private async persistRoute(
    table: string,
    payload: Record<string, unknown>,
    id?: string,
  ) {
    const producerIds = Array.isArray(payload.producer_ids)
      ? (payload.producer_ids as string[])
      : [];
    const routePayload = { ...payload };
    delete routePayload.producer_ids;

    const route = await this.persistPlain(table, routePayload, id);

    if (!route?.id) {
      return route;
    }

    if (id) {
      await this.supabaseService.admin
        .from('producers')
        .update({ route_id: null })
        .eq('route_id', route.id);
    }

    if (producerIds.length) {
      await this.supabaseService.admin
        .from('producers')
        .update({ route_id: route.id })
        .in('id', producerIds);
    }

    return route;
  }

  private async persistSupplier(
    table: string,
    payload: Record<string, unknown>,
    id?: string,
  ) {
    const suppliedItemIds = Array.isArray(payload.supplied_item_ids)
      ? (payload.supplied_item_ids as string[])
      : [];
    const supplierPayload = { ...payload };
    delete supplierPayload.supplied_item_ids;

    const supplier = await this.persistPlain(table, supplierPayload, id);

    if (!supplier?.id) {
      return supplier;
    }

    if (id) {
      await this.supabaseService.admin
        .from('supply_items')
        .update({ default_supplier_id: null })
        .eq('default_supplier_id', supplier.id);
    }

    if (suppliedItemIds.length) {
      await this.supabaseService.admin
        .from('supply_items')
        .update({ default_supplier_id: supplier.id })
        .in('id', suppliedItemIds);
    }

    return supplier;
  }

  private async persistProductSpec(
    table: string,
    payload: Record<string, unknown>,
    id?: string,
  ) {
    const items = Array.isArray(payload.product_spec_items)
      ? (payload.product_spec_items as Array<Record<string, unknown>>)
      : [];
    const specPayload = { ...payload };
    delete specPayload.product_spec_items;

    const spec = await this.persistPlain(table, specPayload, id);

    if (!spec?.id) {
      return spec;
    }

    await this.supabaseService.admin.from('product_spec_items').delete().eq('product_spec_id', spec.id);

    if (items.length) {
      const normalized = items.map((item) => ({
        ...item,
        product_spec_id: spec.id,
      }));

      const { error } = await this.supabaseService.admin.from('product_spec_items').insert(normalized);

      if (error) {
        throw new BadRequestException(error.message);
      }
    }

    return this.getById('productSpecs', spec.id as string);
  }
}
