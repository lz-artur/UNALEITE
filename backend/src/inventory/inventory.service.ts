import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateManualExitDto } from './dto/create-manual-exit.dto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { CreateInventorySessionDto } from './dto/create-inventory-session.dto';
import { SaveInventoryCountsDto } from './dto/save-inventory-counts.dto';
import { ReviewInventoryCountDto } from './dto/review-inventory-count.dto';
import { CreateExpeditionWeighingDto } from './dto/create-expedition-weighing.dto';
import { CreateWarehouseWithdrawalDto } from './dto/create-warehouse-withdrawal.dto';
import { CreateExpiredLotDisposalDto } from './dto/create-expired-lot-disposal.dto';
import { ReviewExpiredLotDisposalDto } from './dto/review-expired-lot-disposal.dto';

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

  async listWarehouseWithdrawals() {
    const { data, error } = await this.supabaseService.admin
      .from('warehouse_withdrawals')
      .select('*, warehouse_withdrawal_items(*, supply_items(name, code, units(symbol)))')
      .order('withdrawal_date', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async createWarehouseWithdrawal(payload: CreateWarehouseWithdrawalDto, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { data: id, error } = await this.supabaseService.admin.rpc('create_warehouse_withdrawal', {
      p_sector: payload.sector,
      p_notes: payload.notes ?? null,
      p_withdrawal_date: payload.withdrawalDate ?? new Date().toISOString(),
      p_created_by: actor.id,
      p_items: payload.items,
    });
    if (error) throw new BadRequestException(error.message);
    const { data: withdrawal, error: loadError } = await this.supabaseService.admin
      .from('warehouse_withdrawals')
      .select('*, warehouse_withdrawal_items(*, supply_items(name, code, units(symbol)))')
      .eq('id', id).single();
    if (loadError) throw new BadRequestException(loadError.message);
    return withdrawal;
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
      .select('id, available_quantity, available_pieces, lot_code')
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
        pieces: payload.pieces ?? null,
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

    const lotUpdateData: any = {
      available_quantity: Number(lot.available_quantity) - payload.quantity,
      updated_by: user?.id ?? null,
    };

    if (payload.pieces) {
      if (lot.available_pieces == null) {
        throw new BadRequestException('Este lote não controla saldo em peças.');
      }
      if (payload.pieces > Number(lot.available_pieces)) {
        throw new BadRequestException(`O lote ${String(lot.lot_code)} não tem peças disponíveis suficientes (Disponível: ${lot.available_pieces})`);
      }
      lotUpdateData.available_pieces = Number(lot.available_pieces) - payload.pieces;
    }

    const { error: lotUpdateError } = await this.supabaseService.admin
      .from('finished_product_lots')
      .update(lotUpdateData)
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

  async listExpiredLotDisposals() {
    const { data, error } = await this.supabaseService.admin.from('expired_lot_disposals').select('*').order('requested_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async getExpiredLotSnapshot(lotType: 'Insumo' | 'Produto Acabado', lotId: string) {
    if (lotType === 'Insumo') {
      const { data, error } = await this.supabaseService.admin.from('supply_lots_with_item')
        .select('id, internal_lot_code, supply_item_name, expiration_date, available_quantity, unit_cost, units(symbol)').eq('id', lotId).maybeSingle();
      if (error) throw new BadRequestException(error.message);
      if (!data) throw new NotFoundException('Lote de insumo não encontrado');
      const unit = Array.isArray(data.units) ? data.units[0] : data.units;
      return { ...data, lotCode: data.internal_lot_code, itemName: data.supply_item_name, unitSymbol: unit?.symbol ?? null, unitCost: Number(data.unit_cost) };
    }
    const { data, error } = await this.supabaseService.admin.from('finished_product_lots')
      .select('id, lot_code, expiration_date, available_quantity, quantity_produced, production_order_id, finished_products(name, units(symbol))').eq('id', lotId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Lote de produto acabado não encontrado');
    const product = Array.isArray(data.finished_products) ? data.finished_products[0] : data.finished_products;
    const unit = Array.isArray(product?.units) ? product.units[0] : product?.units;
    // Custo industrial direto do lote: leite + insumos consumidos na OP, rateado pela produção da OP.
    const [{ data: milk }, { data: supplies }, { data: outputs }] = await Promise.all([
      this.supabaseService.admin.from('production_order_milk_consumptions').select('liters_consumed, unit_cost, milk_lots(cost_per_liter)').eq('production_order_id', data.production_order_id),
      this.supabaseService.admin.from('production_order_supply_consumptions').select('quantity_consumed, supply_lots(unit_cost)').eq('production_order_id', data.production_order_id),
      this.supabaseService.admin.from('finished_product_lots').select('quantity_produced').eq('production_order_id', data.production_order_id),
    ]);
    const milkCost = (milk ?? []).reduce((sum: number, row: any) => sum + Number(row.liters_consumed) * Number(row.unit_cost ?? (Array.isArray(row.milk_lots) ? row.milk_lots[0] : row.milk_lots)?.cost_per_liter ?? 0), 0);
    const suppliesCost = (supplies ?? []).reduce((sum: number, row: any) => sum + Number(row.quantity_consumed) * Number((Array.isArray(row.supply_lots) ? row.supply_lots[0] : row.supply_lots)?.unit_cost ?? 0), 0);
    const totalOutput = (outputs ?? []).reduce((sum: number, row: any) => sum + Number(row.quantity_produced), 0);
    return { ...data, lotCode: data.lot_code, itemName: product?.name ?? 'Produto acabado', unitSymbol: unit?.symbol ?? null, unitCost: totalOutput > 0 ? (milkCost + suppliesCost) / totalOutput : 0 };
  }

  async createExpiredLotDisposal(payload: CreateExpiredLotDisposalDto, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const lot = await this.getExpiredLotSnapshot(payload.lotType, payload.lotId);
    if (!lot.expiration_date || new Date(lot.expiration_date).getTime() >= new Date().setHours(0, 0, 0, 0)) throw new BadRequestException('A baixa especial só pode ser solicitada para lote vencido.');
    if (payload.quantity > Number(lot.available_quantity)) throw new BadRequestException(`Quantidade maior que o saldo disponível (${lot.available_quantity}).`);
    const { data, error } = await this.supabaseService.admin.from('expired_lot_disposals').insert({
      lot_type: payload.lotType, lot_id: payload.lotId, lot_code: lot.lotCode, item_name: lot.itemName, unit_symbol: lot.unitSymbol,
      quantity: payload.quantity, unit_cost: lot.unitCost, total_value: payload.quantity * lot.unitCost, destination: payload.destination,
      justification: payload.justification.trim(), notes: payload.notes?.trim() || null, requested_by: actor.id, requested_by_name: actor.name,
    }).select('*').single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async reviewExpiredLotDisposal(id: string, payload: ReviewExpiredLotDisposalDto, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { data: request, error } = await this.supabaseService.admin.from('expired_lot_disposals').select('*').eq('id', id).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!request) throw new NotFoundException('Solicitação de baixa não encontrada');
    if (request.status !== 'aguardando_aprovacao') throw new BadRequestException('Esta solicitação já foi analisada.');
    if (payload.decision === 'recusada') {
      const { data, error: updateError } = await this.supabaseService.admin.from('expired_lot_disposals').update({ status: 'recusada', reviewed_by: actor.id, reviewed_by_name: actor.name, reviewed_at: new Date().toISOString(), review_note: payload.reviewNote?.trim() || null }).eq('id', id).select('*').single();
      if (updateError) throw new BadRequestException(updateError.message); return data;
    }
    const lot = await this.getExpiredLotSnapshot(request.lot_type, request.lot_id);
    if (Number(request.quantity) > Number(lot.available_quantity)) throw new BadRequestException('O saldo do lote mudou e não é suficiente para aprovar esta baixa.');
    const table = request.lot_type === 'Insumo' ? 'supply_lots' : 'finished_product_lots';
    const { error: stockError } = await this.supabaseService.admin.from(table).update({ available_quantity: Number(lot.available_quantity) - Number(request.quantity), updated_by: actor.id }).eq('id', request.lot_id);
    if (stockError) throw new BadRequestException(stockError.message);
    const isDonation = request.destination === 'doacao_dre';
    const { data: financial, error: financialError } = await this.supabaseService.admin.from('financial_entries').insert({
      entry_type: isDonation ? 'Pagar' : 'Receber', description: `${isDonation ? 'Doação' : 'Repasse a preço de custo'} de lote vencido ${request.lot_code}`,
      amount: request.total_value, due_date: new Date().toISOString(), status: 'Aberto',
      category: isDonation ? 'Doações de lotes vencidos' : 'Repasses de lotes vencidos', reference_table: 'expired_lot_disposals', reference_id: id, created_by: actor.id, updated_by: actor.id,
    }).select('*').single();
    if (financialError) throw new BadRequestException(financialError.message);
    const { error: movementError } = await this.supabaseService.admin.from('stock_movements').insert({ movement_type: 'saida', lot_type: request.lot_type, lot_id: request.lot_id, quantity: request.quantity, reference_table: 'expired_lot_disposals', reference_id: id, created_by: actor.id, updated_by: actor.id });
    if (movementError) throw new BadRequestException(movementError.message);
    const { data, error: updateError } = await this.supabaseService.admin.from('expired_lot_disposals').update({ status: 'aprovada', reviewed_by: actor.id, reviewed_by_name: actor.name, reviewed_at: new Date().toISOString(), review_note: payload.reviewNote?.trim() || null, financial_entry_id: financial.id }).eq('id', id).select('*').single();
    if (updateError) throw new BadRequestException(updateError.message);
    return data;
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
        .select('id, product_id, lot_code, available_quantity, available_pieces, finished_products(name, code, unit_id, tracks_pieces, units(symbol))'),
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
      tracks_pieces: false,
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
        system_pieces: product?.tracks_pieces ? (lot.available_pieces != null ? Number(lot.available_pieces) : 0) : null,
        tracks_pieces: Boolean(product?.tracks_pieces),
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
      .select('id, system_quantity, system_pieces, tracks_pieces')
      .eq('inventory_session_id', sessionId)
      .in('id', ids);
    if (error) throw new BadRequestException(error.message);
    if ((existingItems ?? []).length !== ids.length) {
      throw new BadRequestException('Um ou mais itens não pertencem a este inventário.');
    }

    const quantityById = new Map(payload.items.map((item) => [item.id, item]));
    await Promise.all((existingItems ?? []).map(async (item: any) => {
      const value = quantityById.get(item.id)!;
      const differenceQuantity = value.countedQuantity - Number(item.system_quantity);
      const differencePieces = item.tracks_pieces ? (value.countedPieces ?? 0) - Number(item.system_pieces ?? 0) : null;
      const { error: updateError } = await this.supabaseService.admin
        .from('inventory_count_items')
        .update({
          counted_quantity: value.countedQuantity,
          difference_quantity: differenceQuantity,
          counted_pieces: item.tracks_pieces ? (value.countedPieces ?? null) : null,
          difference_pieces: differencePieces,
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

  async listSaleExpeditions(user: AuthenticatedUser) {
    await this.getActor(user);
    const { data, error } = await this.supabaseService.admin
      .from('sale_expeditions')
      .select('*, sales_orders(order_number, clients(name))')
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((entry: any) => {
      const order = Array.isArray(entry.sales_orders) ? entry.sales_orders[0] : entry.sales_orders;
      const client = Array.isArray(order?.clients) ? order.clients[0] : order?.clients;
      return {
        ...entry,
        order_number: order?.order_number ?? '-',
        client_name: client?.name ?? '-',
        sales_orders: undefined,
      };
    });
  }

  async createSaleExpedition(salesOrderId: string, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { data: order, error: orderError } = await this.supabaseService.admin
      .from('sales_orders')
      .select('id, status')
      .eq('id', salesOrderId)
      .maybeSingle();
    if (orderError) throw new BadRequestException(orderError.message);
    if (!order || ['Atendido', 'Conferido', 'Cancelado'].includes(order.status)) {
      throw new BadRequestException('Este pedido não está disponível para expedição.');
    }

    const { data, error } = await this.supabaseService.admin
      .from('sale_expeditions')
      .insert({
        sales_order_id: salesOrderId,
        expedition_number: `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        created_by: actor.id,
        updated_by: actor.id,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') throw new BadRequestException('Já existe uma expedição em pesagem para este pedido.');
      throw new BadRequestException(error.message);
    }
    await this.insertExpeditionLog(data.id, 'expedicao_iniciada', actor, { sales_order_id: salesOrderId });
    return this.getSaleExpedition(data.id, user);
  }

  async getSaleExpedition(expeditionId: string, user: AuthenticatedUser) {
    await this.getActor(user);
    const { data: expedition, error: expeditionError } = await this.supabaseService.admin
      .from('sale_expeditions')
      .select('*')
      .eq('id', expeditionId)
      .maybeSingle();
    if (expeditionError) throw new BadRequestException(expeditionError.message);
    if (!expedition) throw new NotFoundException('Expedição não encontrada');

    const [{ data: order, error: orderError }, { data: orderItems, error: itemError }, { data: lines, error: lineError }, { data: logs, error: logError }] = await Promise.all([
      this.supabaseService.admin.from('sales_orders').select('*').eq('id', expedition.sales_order_id).single(),
      this.supabaseService.admin.from('sales_order_items').select('*').eq('sales_order_id', expedition.sales_order_id),
      this.supabaseService.admin.from('sale_expedition_lines').select('*').eq('expedition_id', expeditionId),
      this.supabaseService.admin.from('sale_expedition_logs').select('*').eq('expedition_id', expeditionId).order('created_at', { ascending: false }),
    ]);
    if (orderError) throw new BadRequestException(orderError.message);
    if (itemError) throw new BadRequestException(itemError.message);
    if (lineError) throw new BadRequestException(lineError.message);
    if (logError) throw new BadRequestException(logError.message);

    const productIds = [...new Set((orderItems ?? []).map((item: any) => item.product_id))];
    const lineIds = (lines ?? []).map((line: any) => line.id);
    const lotIds = [...new Set((lines ?? []).map((line: any) => line.finished_product_lot_id))];
    const [{ data: products, error: productError }, { data: lots, error: lotError }, { data: weighings, error: weighingError }, { data: client, error: clientError }] = await Promise.all([
      productIds.length ? this.supabaseService.admin.from('finished_products').select('id, name, code, unit_id').in('id', productIds) : Promise.resolve({ data: [], error: null }),
      lotIds.length ? this.supabaseService.admin.from('finished_product_lots').select('id, lot_code, product_id, available_quantity, available_pieces').in('id', lotIds) : Promise.resolve({ data: [], error: null }),
      lineIds.length ? this.supabaseService.admin.from('sale_expedition_weighings').select('*').in('expedition_line_id', lineIds).order('weighed_at') : Promise.resolve({ data: [], error: null }),
      this.supabaseService.admin.from('clients').select('id, name').eq('id', order.client_id).maybeSingle(),
    ]);
    if (productError || lotError || weighingError || clientError) {
      throw new BadRequestException(productError?.message || lotError?.message || weighingError?.message || clientError?.message || 'Erro ao carregar expedição');
    }

    const productById = new Map((products ?? []).map((product: any) => [product.id, product]));
    const lotById = new Map((lots ?? []).map((lot: any) => [lot.id, lot]));
    const weighingsByLine = new Map<string, any[]>();
    (weighings ?? []).forEach((weighing: any) => {
      const collection = weighingsByLine.get(weighing.expedition_line_id) ?? [];
      collection.push(weighing);
      weighingsByLine.set(weighing.expedition_line_id, collection);
    });
    const linesByItem = new Map<string, any[]>();
    (lines ?? []).forEach((line: any) => {
      const collection = linesByItem.get(line.sales_order_item_id) ?? [];
      collection.push({
        ...line,
        lot: lotById.get(line.finished_product_lot_id),
        weighings: weighingsByLine.get(line.id) ?? [],
        weighed_quantity: (weighingsByLine.get(line.id) ?? []).reduce((sum, weighing) => sum + Number(weighing.quantity), 0),
        weighed_pieces: (weighingsByLine.get(line.id) ?? []).reduce((sum, weighing) => sum + Number(weighing.pieces_quantity ?? 0), 0),
      });
      linesByItem.set(line.sales_order_item_id, collection);
    });

    return {
      ...expedition,
      order: {
        id: order.id,
        number: order.order_number,
        client_name: client?.name ?? '-',
        status: order.status,
        items: (orderItems ?? []).map((item: any) => {
          const product = productById.get(item.product_id);
          return {
            id: item.id,
            product_id: item.product_id,
            product_name: product?.name ?? '-',
            product_code: product?.code ?? null,
            unit_id: product?.unit_id ?? null,
            ordered_quantity: Number(item.ordered_quantity),
            fulfilled_quantity: Number(item.fulfilled_quantity),
            pending_quantity: Math.max(0, Number(item.ordered_quantity) - Number(item.fulfilled_quantity)),
            lines: linesByItem.get(item.id) ?? [],
          };
        }),
      },
      logs: logs ?? [],
    };
  }

  async createExpeditionWeighing(expeditionId: string, payload: CreateExpeditionWeighingDto, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { error } = await this.supabaseService.admin.rpc('register_sale_expedition_weighing', {
      p_expedition_id: expeditionId,
      p_sales_order_item_id: payload.salesOrderItemId,
      p_finished_product_lot_id: payload.finishedProductLotId,
      p_quantity: payload.quantity,
      p_pieces_quantity: payload.piecesQuantity ?? null,
      p_notes: payload.notes?.trim() || null,
      p_user_id: actor.id,
    });
    if (error) throw new BadRequestException(error.message);
    await this.insertExpeditionLog(expeditionId, 'pesagem_registrada', actor, { item_id: payload.salesOrderItemId, lot_id: payload.finishedProductLotId, quantidade: payload.quantity, pecas: payload.piecesQuantity ?? null });
    return this.getSaleExpedition(expeditionId, user);
  }

  async deleteExpeditionWeighing(expeditionId: string, weighingId: string, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { data: expedition, error: expeditionError } = await this.supabaseService.admin
      .from('sale_expeditions').select('status').eq('id', expeditionId).maybeSingle();
    if (expeditionError) throw new BadRequestException(expeditionError.message);
    if (!expedition || expedition.status !== 'em_pesagem') throw new BadRequestException('Esta expedição não está aberta para alteração.');
    const { data: lines, error: lineError } = await this.supabaseService.admin.from('sale_expedition_lines').select('id').eq('expedition_id', expeditionId);
    if (lineError) throw new BadRequestException(lineError.message);
    const lineIds = (lines ?? []).map((line: any) => line.id);
    const { data: weighing, error: weighingError } = await this.supabaseService.admin.from('sale_expedition_weighings').select('*').eq('id', weighingId).in('expedition_line_id', lineIds).maybeSingle();
    if (weighingError) throw new BadRequestException(weighingError.message);
    if (!weighing) throw new NotFoundException('Pesagem não encontrada');
    const { error: deleteError } = await this.supabaseService.admin.from('sale_expedition_weighings').delete().eq('id', weighingId);
    if (deleteError) throw new BadRequestException(deleteError.message);
    await this.insertExpeditionLog(expeditionId, 'pesagem_removida', actor, { quantidade: weighing.quantity });
    return this.getSaleExpedition(expeditionId, user);
  }

  async confirmSaleExpedition(expeditionId: string, user: AuthenticatedUser) {
    const actor = await this.getActor(user);
    const { data: attendanceId, error } = await this.supabaseService.admin.rpc('confirm_sale_expedition', {
      p_expedition_id: expeditionId, p_user_id: actor.id,
    });
    if (error) throw new BadRequestException(error.message);
    await this.insertExpeditionLog(expeditionId, 'expedicao_confirmada', actor, { attendance_id: attendanceId });
    return this.getSaleExpedition(expeditionId, user);
  }

  private async insertExpeditionLog(expeditionId: string, action: string, actor: { id: string; name: string }, details: Record<string, unknown>) {
    const { error } = await this.supabaseService.admin.from('sale_expedition_logs').insert({
      expedition_id: expeditionId, action, actor_id: actor.id, actor_name: actor.name, details,
    });
    if (error) throw new BadRequestException(error.message);
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
