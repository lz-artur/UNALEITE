import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateManualExitDto } from './dto/create-manual-exit.dto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { CreateInventorySessionDto } from './dto/create-inventory-session.dto';
import { SaveInventoryCountsDto } from './dto/save-inventory-counts.dto';
import { ReviewInventoryCountDto } from './dto/review-inventory-count.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
  ) {}

  private async getActor(user: AuthenticatedUser) {
    const profile = await this.usersService.ensureAppUser(user);
    return {
      id: user.id,
      name: profile.display_name || profile.email || user.email || 'Usuário',
      isAdmin: profile.role === 'admin',
    };
  }

  private async getSessionForUser(sessionId: string, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { data: session, error } = await this.supabaseService.admin
      .from('inventory_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!session) throw new NotFoundException('Sessão de inventário não encontrada');
    if (!actor.isAdmin && session.created_by !== actor.id) {
      throw new NotFoundException('Sessão de inventário não encontrada');
    }

    return { actor, session };
  }

  async getSummary() {
    const [milkLots, supplyLots, finishedProductLots] = await Promise.all([
      this.getMilkLots(),
      this.getSupplyLots(),
      this.getFinishedProductLots(),
    ]);

    return {
      milkLotsCount: milkLots.length,
      supplyLotsCount: supplyLots.length,
      finishedProductLotsCount: finishedProductLots.length,
      supplyBelowMinimumCount: supplyLots.filter(
        (lot) => Number(lot.available_quantity) <= Number(lot.minimum_stock ?? 0),
      ).length,
    };
  }

  async getMilkLots() {
    const { data, error } = await this.supabaseService.admin
      .from('milk_lots')
      .select('*')
      .order('received_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async getSupplyLots() {
    const { data, error } = await this.supabaseService.admin
      .from('supply_lots_with_item')
      .select('*')
      .order('entry_date', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async getFinishedProductLots() {
    const { data, error } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('*')
      .order('produced_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  async deleteSupplyLot(id: string) {
    const { data: lot, error: findError } = await this.supabaseService.admin
      .from('supply_lots')
      .select('id, received_quantity, available_quantity')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!lot) throw new NotFoundException('Lote de insumo não encontrado');

    if (lot.available_quantity < lot.received_quantity) {
      throw new BadRequestException('Não é possível excluir o lote de insumo pois ele já foi parcialmente ou totalmente consumido.');
    }

    const { error: deleteError } = await this.supabaseService.admin
      .from('supply_lots')
      .delete()
      .eq('id', id);

    if (deleteError) throw new BadRequestException(deleteError.message);
    return { success: true };
  }

  async deleteFinishedProductLot(id: string) {
    const { data: lot, error: findError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('id, quantity_produced, available_quantity')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!lot) throw new NotFoundException('Lote de produto acabado não encontrado');

    if (lot.available_quantity < lot.quantity_produced) {
      throw new BadRequestException('Não é possível excluir o lote de produto pois ele já foi parcialmente ou totalmente vendido.');
    }

    const { error: deleteError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .delete()
      .eq('id', id);

    if (deleteError) throw new BadRequestException(deleteError.message);
    return { success: true };
  }

  async createManualExit(payload: CreateManualExitDto, user?: AuthenticatedUser) {
    const { data: lot, error: findError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .select('id, available_quantity, lot_code')
      .eq('id', payload.finishedProductLotId)
      .maybeSingle();

    if (findError) throw new BadRequestException(findError.message);
    if (!lot) throw new NotFoundException('Lote de produto acabado não encontrado');

    if (payload.quantity > Number(lot.available_quantity)) {
      throw new BadRequestException(`O lote ${String(lot.lot_code)} não tem quantidade disponível suficiente (Disponível: ${lot.available_quantity})`);
    }

    const exitDate = payload.exitDate ?? new Date().toISOString();

    const { data: exitRecord, error: exitError } = await this.supabaseService.admin
      .from('finished_product_manual_exits')
      .insert({
        finished_product_lot_id: payload.finishedProductLotId,
        quantity: payload.quantity,
        reason: payload.reason,
        notes: payload.notes ?? null,
        exit_date: exitDate,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      })
      .select('*')
      .single();

    if (exitError) {
      throw new BadRequestException(exitError.message);
    }

    const { error: lotUpdateError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .update({
        available_quantity: Number(lot.available_quantity) - payload.quantity,
        updated_by: user?.id ?? null,
      })
      .eq('id', payload.finishedProductLotId);

    if (lotUpdateError) {
      throw new BadRequestException(lotUpdateError.message);
    }

    const { error: movementError } = await this.supabaseService.admin
      .from('stock_movements')
      .insert({
        movement_type: 'saida',
        lot_type: 'Produto Acabado',
        lot_id: payload.finishedProductLotId,
        quantity: payload.quantity,
        reference_table: 'finished_product_manual_exits',
        reference_id: exitRecord.id,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });

    if (movementError) {
      throw new BadRequestException(movementError.message);
    }

    return { success: true, exitRecord };
  }

  async listInventorySessions(user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    let query = this.supabaseService.admin
      .from('inventory_sessions')
      .select('*, inventory_count_items(id, status, difference_quantity)')
      .order('started_at', { ascending: false });

    if (!actor.isAdmin) query = query.eq('created_by', actor.id);
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return (data ?? []).map((session: any) => {
      const items = session.inventory_count_items ?? [];
      return {
        ...session,
        total_items: items.length,
        pending_items: items.filter((item: any) => item.status === 'aguardando_aprovacao').length,
        divergent_items: items.filter((item: any) => Number(item.difference_quantity) !== 0).length,
        inventory_count_items: undefined,
      };
    });
  }

  async createInventorySession(payload: CreateInventorySessionDto, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const title = payload.title?.trim() || `Inventário de ${new Date().toLocaleDateString('pt-BR')}`;

    const [{ data: supplyLots, error: supplyError }, { data: finishedLots, error: finishedError }] = await Promise.all([
      this.supabaseService.admin
        .from('supply_lots_with_item')
        .select('id, supply_item_id, internal_lot_code, available_quantity, supply_item_name, unit_id'),
      this.supabaseService.admin
        .from('finished_product_lots')
        .select('id, product_id, lot_code, available_quantity, finished_products(name, code, unit_id, units(symbol))'),
    ]);

    if (supplyError) throw new BadRequestException(supplyError.message);
    if (finishedError) throw new BadRequestException(finishedError.message);

    const { data: session, error: sessionError } = await this.supabaseService.admin
      .from('inventory_sessions')
      .insert({ title, created_by: actor.id, created_by_name: actor.name })
      .select('*')
      .single();
    if (sessionError || !session) throw new BadRequestException(sessionError?.message || 'Não foi possível iniciar o inventário');

    const supplyItems = (supplyLots ?? []).map((lot: any) => ({
      inventory_session_id: session.id,
      lot_type: 'Insumo',
      lot_id: lot.id,
      product_id: lot.supply_item_id,
      product_name: lot.supply_item_name,
      lot_code: lot.internal_lot_code,
      unit_symbol: null,
      system_quantity: Number(lot.available_quantity),
    }));
    const productItems = (finishedLots ?? []).map((lot: any) => {
      const product = Array.isArray(lot.finished_products) ? lot.finished_products[0] : lot.finished_products;
      const unit = Array.isArray(product?.units) ? product.units[0] : product?.units;
      return {
        inventory_session_id: session.id,
        lot_type: 'Produto Acabado',
        lot_id: lot.id,
        product_id: lot.product_id,
        product_name: product?.name ?? 'Produto sem nome',
        product_code: product?.code ?? null,
        lot_code: lot.lot_code,
        unit_symbol: unit?.symbol ?? null,
        system_quantity: Number(lot.available_quantity),
      };
    });

    const snapshotItems = [...supplyItems, ...productItems];
    if (snapshotItems.length) {
      const { error: itemError } = await this.supabaseService.admin
        .from('inventory_count_items')
        .insert(snapshotItems);
      if (itemError) throw new BadRequestException(itemError.message);
    }

    await this.insertAuditLog(session.id, null, 'inventario_iniciado', actor, {
      itens: snapshotItems.length,
      insumos: supplyItems.length,
      produtos_acabados: productItems.length,
    });

    return this.getInventorySession(session.id, user);
  }

  private async saveCountValues(sessionId: string, payload: SaveInventoryCountsDto, user: AuthenticatedUser) {
    const { actor, session } = await this.getSessionForUser(sessionId, user);
    if (session.status !== 'em_contagem') {
      throw new BadRequestException('Esta contagem já foi enviada para aprovação e não pode mais ser alterada.');
    }
    if (!payload.items.length) return { actor, session, items: [] };

    const ids = [...new Set(payload.items.map((item) => item.id))];
    if (ids.length !== payload.items.length) {
      throw new BadRequestException('Há itens duplicados na contagem.');
    }
    const { data: existingItems, error } = await this.supabaseService.admin
      .from('inventory_count_items')
      .select('id, system_quantity')
      .eq('inventory_session_id', sessionId)
      .in('id', ids);
    if (error) throw new BadRequestException(error.message);
    if ((existingItems ?? []).length !== ids.length) {
      throw new BadRequestException('Um ou mais itens não pertencem a este inventário.');
    }

    const quantityById = new Map(payload.items.map((item) => [item.id, item]));
    await Promise.all((existingItems ?? []).map(async (item: any) => {
      const value = quantityById.get(item.id)!;
      const { error: updateError } = await this.supabaseService.admin
        .from('inventory_count_items')
        .update({
          counted_quantity: value.countedQuantity,
          difference_quantity: value.countedQuantity - Number(item.system_quantity),
          notes: value.notes?.trim() || null,
          status: 'nao_contado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (updateError) throw new BadRequestException(updateError.message);
    }));
    return { actor, session, items: existingItems ?? [] };
  }

  async saveInventoryCounts(sessionId: string, payload: SaveInventoryCountsDto, user: AuthenticatedUser) {
    await this.saveCountValues(sessionId, payload, user);
    return this.getInventorySession(sessionId, user);
  }

  async submitInventorySession(sessionId: string, payload: SaveInventoryCountsDto, user: AuthenticatedUser) {
    const { actor } = await this.saveCountValues(sessionId, payload, user);
    const { data: items, error: itemsError } = await this.supabaseService.admin
      .from('inventory_count_items')
      .select('id, counted_quantity, difference_quantity')
      .eq('inventory_session_id', sessionId);
    if (itemsError) throw new BadRequestException(itemsError.message);
    if ((items ?? []).some((item: any) => item.counted_quantity === null)) {
      throw new BadRequestException('Informe a quantidade física de todos os itens antes de enviar.');
    }

    const divergentItems = (items ?? []).filter((item: any) => Number(item.difference_quantity) !== 0);
    const now = new Date().toISOString();
    const { error: itemUpdateError } = await this.supabaseService.admin
      .from('inventory_count_items')
      .update({ status: 'confere', submitted_at: now, updated_at: now })
      .eq('inventory_session_id', sessionId)
      .eq('status', 'nao_contado');
    if (itemUpdateError) throw new BadRequestException(itemUpdateError.message);

    if (divergentItems.length) {
      const { error: divergenceUpdateError } = await this.supabaseService.admin
        .from('inventory_count_items')
        .update({ status: 'aguardando_aprovacao', submitted_at: now, updated_at: now })
        .eq('inventory_session_id', sessionId)
        .in('id', divergentItems.map((item: any) => item.id));
      if (divergenceUpdateError) throw new BadRequestException(divergenceUpdateError.message);
    }

    const nextStatus = divergentItems.length ? 'aguardando_aprovacao' : 'concluido';
    const { error: sessionError } = await this.supabaseService.admin
      .from('inventory_sessions')
      .update({
        status: nextStatus,
        submitted_at: now,
        completed_at: divergentItems.length ? null : now,
        updated_at: now,
      })
      .eq('id', sessionId);
    if (sessionError) throw new BadRequestException(sessionError.message);

    await this.insertAuditLog(sessionId, null, 'contagem_enviada', actor, {
      itens_contados: items?.length ?? 0,
      divergencias: divergentItems.length,
      status: nextStatus,
    });
    return this.getInventorySession(sessionId, user);
  }

  async getInventorySession(sessionId: string, user: AuthenticatedUser) {
    await this.getSessionForUser(sessionId, user);
    const [sessionResult, itemsResult, logsResult] = await Promise.all([
      this.supabaseService.admin.from('inventory_sessions').select('*').eq('id', sessionId).single(),
      this.supabaseService.admin.from('inventory_count_items').select('*').eq('inventory_session_id', sessionId).order('product_name'),
      this.supabaseService.admin.from('inventory_audit_logs').select('*').eq('inventory_session_id', sessionId).order('created_at', { ascending: false }),
    ]);
    if (sessionResult.error) throw new BadRequestException(sessionResult.error.message);
    if (itemsResult.error) throw new BadRequestException(itemsResult.error.message);
    if (logsResult.error) throw new BadRequestException(logsResult.error.message);
    return { ...sessionResult.data, items: itemsResult.data ?? [], logs: logsResult.data ?? [] };
  }

  async approveInventoryCountItem(
    sessionId: string,
    itemId: string,
    payload: ReviewInventoryCountDto,
    user: AuthenticatedUser,
  ) {
    const { actor } = await this.getSessionForUser(sessionId, user);
    const { data, error } = await this.supabaseService.admin.rpc('approve_inventory_count_item', {
      p_item_id: itemId,
      p_approver_id: actor.id,
      p_approver_name: actor.name,
      p_review_note: payload.note?.trim() || null,
    });
    if (error) throw new BadRequestException(error.message);
    return { ...(data ?? {}), session: await this.getInventorySession(sessionId, user) };
  }

  async rejectInventoryCountItem(
    sessionId: string,
    itemId: string,
    payload: ReviewInventoryCountDto,
    user: AuthenticatedUser,
  ) {
    const { actor } = await this.getSessionForUser(sessionId, user);
    const { data: item, error: findError } = await this.supabaseService.admin
      .from('inventory_count_items')
      .select('*')
      .eq('id', itemId)
      .eq('inventory_session_id', sessionId)
      .maybeSingle();
    if (findError) throw new BadRequestException(findError.message);
    if (!item) throw new NotFoundException('Item de inventário não encontrado');
    if (item.status !== 'aguardando_aprovacao') {
      throw new BadRequestException('Este item não está aguardando aprovação.');
    }

    const now = new Date().toISOString();
    const { error: updateError } = await this.supabaseService.admin
      .from('inventory_count_items')
      .update({
        status: 'recusado', reviewed_at: now, reviewed_by: actor.id,
        reviewed_by_name: actor.name, review_note: payload.note?.trim() || null, updated_at: now,
      })
      .eq('id', itemId);
    if (updateError) throw new BadRequestException(updateError.message);

    await this.insertAuditLog(sessionId, itemId, 'ajuste_recusado', actor, {
      quantidade_sistema: item.system_quantity,
      quantidade_fisica: item.counted_quantity,
      diferenca: item.difference_quantity,
      observacao: payload.note?.trim() || null,
    });
    const { count, error: pendingError } = await this.supabaseService.admin
      .from('inventory_count_items')
      .select('id', { count: 'exact', head: true })
      .eq('inventory_session_id', sessionId)
      .eq('status', 'aguardando_aprovacao');
    if (pendingError) throw new BadRequestException(pendingError.message);
    if (!count) {
      const { error: completeError } = await this.supabaseService.admin
        .from('inventory_sessions')
        .update({ status: 'concluido', completed_at: now, updated_at: now })
        .eq('id', sessionId);
      if (completeError) throw new BadRequestException(completeError.message);
    }
    return this.getInventorySession(sessionId, user);
  }

  private async insertAuditLog(
    sessionId: string,
    itemId: string | null,
    action: string,
    actor: { id: string; name: string },
    details: Record<string, unknown>,
  ) {
    const { error } = await this.supabaseService.admin.from('inventory_audit_logs').insert({
      inventory_session_id: sessionId,
      inventory_count_item_id: itemId,
      action,
      actor_id: actor.id,
      actor_name: actor.name,
      details,
    });
    if (error) throw new BadRequestException(error.message);
  }
}
