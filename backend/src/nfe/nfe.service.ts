import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateNfeDraftDto, ListNfeDto, UpdateNfeDraftDto, UpdateNfeItemDto } from './dto/nfe.dto';
import { NfeConfigService } from './nfe-config.service';
import { NfeValidationService } from './nfe-validation.service';

const EDITABLE_STATUSES = ['RASCUNHO', 'VALIDADA', 'REJEITADA'];
const NON_TAXED_CONTRIBUTION_CSTS = new Set(['04', '05', '06', '07', '08', '09']);

function normalizeCst(value: unknown, size = 2) {
  return String(value ?? '').replace(/\D/g, '').slice(-size).padStart(size, '0');
}

function effectiveRate(rate: Decimal.Value, reduction: Decimal.Value) {
  return new Decimal(rate ?? 0).mul(new Decimal(100).minus(reduction ?? 0)).div(100);
}

@Injectable()
export class NfeService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: NfeConfigService,
    private readonly validationService: NfeValidationService,
  ) {}

  async list(filters: ListNfeDto = {}) {
    let query = this.supabaseService.admin.from('nfe_invoices').select('*');
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    const invoices = data ?? [];
    const orderIds = invoices.map((item) => item.sales_order_id);
    const { data: orders } = orderIds.length
      ? await this.supabaseService.admin.from('sales_orders').select('id,order_number,client_id').in('id', orderIds)
      : { data: [] as any[] };
    const clientIds = (orders ?? []).map((item) => item.client_id);
    const { data: clients } = clientIds.length
      ? await this.supabaseService.admin.from('clients').select('id,name,document').in('id', clientIds)
      : { data: [] as any[] };
    return invoices.map((invoice) => ({
      ...invoice,
      sales_order: (orders ?? []).find((order) => order.id === invoice.sales_order_id),
      client: (clients ?? []).find((client) => client.id === (orders ?? []).find((order) => order.id === invoice.sales_order_id)?.client_id),
    })).filter((invoice) => {
      if (!filters.search) return true;
      const haystack = `${invoice.number ?? ''} ${invoice.access_key ?? ''} ${invoice.sales_order?.order_number ?? ''} ${invoice.client?.name ?? ''}`.toLowerCase();
      return haystack.includes(filters.search.toLowerCase());
    });
  }

  async eligibleOrders() {
    const config = await this.configService.getRawConfig();
    const { data: orders, error } = await this.supabaseService.admin
      .from('sales_orders').select('*').eq('status', 'Atendido').order('order_date', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    const ids = (orders ?? []).map((order) => order.id);
    const { data: invoices } = ids.length
      ? await this.supabaseService.admin.from('nfe_invoices').select('sales_order_id,status,environment').in('sales_order_id', ids)
      : { data: [] as any[] };
    const available = (orders ?? []).filter((order) => !(invoices ?? []).some((invoice) =>
      invoice.sales_order_id === order.id
      && invoice.environment === config.environment
      && invoice.status !== 'CANCELADA',
    ));
    const clientIds = available.map((order) => order.client_id);
    const { data: clients } = clientIds.length
      ? await this.supabaseService.admin.from('clients').select('id,name,document').in('id', clientIds)
      : { data: [] as any[] };
    return available.map((order) => ({ ...order, client: (clients ?? []).find((client) => client.id === order.client_id) }));
  }

  async get(id: string) {
    const { data: invoice, error } = await this.supabaseService.admin.from('nfe_invoices').select('*').eq('id', id).single();
    if (error || !invoice) throw new NotFoundException('NF-e não encontrada.');
    const { data: items, error: itemsError } = await this.supabaseService.admin
      .from('nfe_invoice_items').select('*, nfe_invoice_fulfillments(*)').eq('nfe_invoice_id', id).order('item_number');
    if (itemsError) throw new BadRequestException(itemsError.message);
    const { data: transmissions } = await this.supabaseService.admin.from('nfe_transmissions').select('*').eq('nfe_invoice_id', id).order('created_at', { ascending: false });
    const { data: events } = await this.supabaseService.admin.from('nfe_events').select('*').eq('nfe_invoice_id', id).order('created_at', { ascending: false });
    return { ...invoice, items: items ?? [], transmissions: transmissions ?? [], events: events ?? [] };
  }

  async createDraft(payload: CreateNfeDraftDto, user?: AuthenticatedUser) {
    const config = await this.configService.getRawConfig();
    const { data: existing } = await this.supabaseService.admin
      .from('nfe_invoices')
      .select('id,status')
      .eq('sales_order_id', payload.salesOrderId)
      .eq('environment', config.environment)
      .neq('status', 'CANCELADA')
      .maybeSingle();
    if (existing) return this.get(existing.id);

    const { data: order, error } = await this.supabaseService.admin.from('sales_orders').select('*').eq('id', payload.salesOrderId).single();
    if (error || !order) throw new NotFoundException('Pedido de venda não encontrado.');
    if (order.status !== 'Atendido') throw new BadRequestException('Somente pedidos totalmente atendidos podem ser faturados.');

    const [{ data: client }, { data: orderItems }, { data: fulfillments }] = await Promise.all([
      this.supabaseService.admin.from('clients').select('*').eq('id', order.client_id).single(),
      this.supabaseService.admin.from('sales_order_items').select('*').eq('sales_order_id', order.id).order('created_at'),
      this.supabaseService.admin.from('sales_order_fulfillments').select('*').eq('sales_order_id', order.id),
    ]);
    if (!client || !orderItems?.length) throw new BadRequestException('Pedido sem destinatário ou itens.');
    const productIds = orderItems.map((item) => item.product_id);
    const { data: products, error: productsError } = await this.supabaseService.admin.from('finished_products').select('*').in('id', productIds);
    if (productsError) throw new BadRequestException(productsError.message);

    const recipient = {
      id: client.id, name: client.name, trade_name: client.trade_name, document: client.document,
      state_registration: client.state_registration, ie_indicator: client.ie_indicator,
      final_consumer: client.final_consumer ?? false, email: client.email, phone: client.phone,
      address: client.address, address_number: client.address_number, address_complement: client.address_complement,
      neighborhood: client.neighborhood, city_code: client.city_code, city: client.city, state: client.state,
      cep: client.cep, country_code: client.country_code ?? '1058', country_name: client.country_name ?? 'Brasil',
    };
    const { data: invoice, error: invoiceError } = await this.supabaseService.admin.from('nfe_invoices').insert({
      sales_order_id: order.id, environment: config.environment, model: 55, series: config.series,
      status: 'RASCUNHO', nature_of_operation: config.default_nature_of_operation,
      operation_type: 1, presence_indicator: 2, freight_mode: 0,
      final_consumer: recipient.final_consumer, issuer_snapshot: this.issuerSnapshot(config), recipient_snapshot: recipient,
      additional_info: order.notes, fiscal_additional_info: config.default_additional_info,
      created_by: user?.id ?? null, updated_by: user?.id ?? null,
    }).select('*').single();
    if (invoiceError || !invoice) throw new BadRequestException(invoiceError?.message ?? 'Falha ao criar rascunho.');

    const itemRows = orderItems.map((orderItem, index) => {
      const product = (products ?? []).find((entry) => entry.id === orderItem.product_id);
      const quantity = new Decimal(orderItem.fulfilled_quantity);
      const price = new Decimal(orderItem.unit_price);
      const gross = quantity.mul(price);
      const base = gross;
      const icmsRate = new Decimal(config.default_icms_rate ?? 0);
      const pisCst = normalizeCst(product?.pis_cst);
      const cofinsCst = normalizeCst(product?.cofins_cst);
      const isZeroRatedBasicFood = String(product?.ibs_cbs_cst) === '200'
        && String(product?.ibs_cbs_classification) === '200003';
      const pisRate = NON_TAXED_CONTRIBUTION_CSTS.has(pisCst) ? new Decimal(0) : new Decimal(config.default_pis_rate ?? 0);
      const cofinsRate = NON_TAXED_CONTRIBUTION_CSTS.has(cofinsCst) ? new Decimal(0) : new Decimal(config.default_cofins_rate ?? 0);
      const ibsStateRate = new Decimal(product?.ibs_state_rate ?? 0.1);
      const ibsStateReduction = new Decimal(product?.ibs_state_reduction ?? (isZeroRatedBasicFood ? 100 : 0));
      const ibsCityRate = new Decimal(product?.ibs_city_rate ?? 0);
      const ibsCityReduction = new Decimal(product?.ibs_city_reduction ?? (isZeroRatedBasicFood ? 100 : 0));
      const cbsRate = new Decimal(product?.cbs_rate ?? 0.9);
      const cbsReduction = new Decimal(product?.cbs_reduction ?? (isZeroRatedBasicFood ? 100 : 0));
      const interstate = client.state && String(client.state).toUpperCase() !== String(config.state).toUpperCase();
      return {
        nfe_invoice_id: invoice.id, sales_order_item_id: orderItem.id, product_id: orderItem.product_id,
        item_number: index + 1, product_code: product?.fiscal_code ?? product?.code ?? String(index + 1), product_name_snapshot: product?.name ?? 'Produto',
        fiscal_name_snapshot: product?.fiscal_name, ncm: product?.ncm, cest: product?.cest,
        cfop: interstate ? product?.interstate_cfop : product?.internal_cfop, goods_origin: product?.goods_origin,
        commercial_unit_symbol: product?.commercial_unit_symbol, tax_unit_symbol: product?.tax_unit_symbol,
        commercial_quantity: quantity.toNumber(), tax_quantity: quantity.toNumber(), unit_price: price.toNumber(),
        gross_value: gross.toDecimalPlaces(4).toNumber(), total_value: gross.toDecimalPlaces(4).toNumber(),
        icms_cst: normalizeCst(product?.icms_cst), icms_base: base.toNumber(), icms_rate: icmsRate.toNumber(), icms_value: base.mul(icmsRate).div(100).toDecimalPlaces(4).toNumber(),
        pis_cst: pisCst, pis_base: NON_TAXED_CONTRIBUTION_CSTS.has(pisCst) ? 0 : base.toNumber(), pis_rate: pisRate.toNumber(), pis_value: base.mul(pisRate).div(100).toDecimalPlaces(4).toNumber(),
        cofins_cst: cofinsCst, cofins_base: NON_TAXED_CONTRIBUTION_CSTS.has(cofinsCst) ? 0 : base.toNumber(), cofins_rate: cofinsRate.toNumber(), cofins_value: base.mul(cofinsRate).div(100).toDecimalPlaces(4).toNumber(),
        ibs_cbs_cst: product?.ibs_cbs_cst, ibs_cbs_classification: product?.ibs_cbs_classification,
        ibs_base: base.toNumber(), ibs_state_rate: ibsStateRate.toNumber(), ibs_state_reduction: ibsStateReduction.toNumber(),
        ibs_city_rate: ibsCityRate.toNumber(), ibs_city_reduction: ibsCityReduction.toNumber(),
        ibs_value: base.mul(effectiveRate(ibsStateRate, ibsStateReduction).plus(effectiveRate(ibsCityRate, ibsCityReduction))).div(100).toDecimalPlaces(4).toNumber(),
        cbs_base: base.toNumber(), cbs_rate: cbsRate.toNumber(), cbs_reduction: cbsReduction.toNumber(),
        cbs_value: base.mul(effectiveRate(cbsRate, cbsReduction)).div(100).toDecimalPlaces(4).toNumber(),
        additional_info: product?.fiscal_additional_info,
      };
    });
    const { data: createdItems, error: itemError } = await this.supabaseService.admin.from('nfe_invoice_items').insert(itemRows).select('id,sales_order_item_id');
    if (itemError) throw new BadRequestException(itemError.message);
    const links = (fulfillments ?? []).map((fulfillment) => ({
      nfe_invoice_item_id: createdItems?.find((item) => item.sales_order_item_id === fulfillment.sales_order_item_id)?.id,
      sales_order_fulfillment_id: fulfillment.id, finished_product_lot_id: fulfillment.finished_product_lot_id,
      quantity: fulfillment.quantity,
    })).filter((link) => link.nfe_invoice_item_id);
    if (links.length) await this.supabaseService.admin.from('nfe_invoice_fulfillments').insert(links);
    await this.recalculate(invoice.id, user);
    return this.validate(invoice.id, user);
  }

  async update(id: string, payload: UpdateNfeDraftDto, user?: AuthenticatedUser) {
    await this.assertEditable(id);
    const map: Record<string, string> = {
      natureOfOperation: 'nature_of_operation', operationType: 'operation_type', purpose: 'purpose', presenceIndicator: 'presence_indicator',
      finalConsumer: 'final_consumer', freightMode: 'freight_mode', recipient: 'recipient_snapshot',
      transport: 'transport_snapshot', payment: 'payment_snapshot', additionalInfo: 'additional_info',
      fiscalAdditionalInfo: 'fiscal_additional_info',
    };
    const update: Record<string, unknown> = { status: 'RASCUNHO', updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
    for (const [key, column] of Object.entries(map)) {
      const value = payload[key as keyof UpdateNfeDraftDto];
      if (value !== undefined) update[column] = value;
    }
    const { error } = await this.supabaseService.admin.from('nfe_invoices').update(update).eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return this.validate(id, user);
  }

  async updateItem(invoiceId: string, itemId: string, payload: UpdateNfeItemDto, user?: AuthenticatedUser) {
    await this.assertEditable(invoiceId);
    const map: Record<string, string> = {
      productCode: 'product_code', fiscalName: 'fiscal_name_snapshot', ncm: 'ncm', cest: 'cest', cfop: 'cfop', goodsOrigin: 'goods_origin',
      commercialUnitSymbol: 'commercial_unit_symbol', taxUnitSymbol: 'tax_unit_symbol', discountValue: 'discount_value',
      freightValue: 'freight_value', insuranceValue: 'insurance_value', otherValue: 'other_value', icmsCst: 'icms_cst',
      icmsRate: 'icms_rate', pisCst: 'pis_cst', pisRate: 'pis_rate', cofinsCst: 'cofins_cst', cofinsRate: 'cofins_rate',
      ibsCbsCst: 'ibs_cbs_cst', ibsCbsClassification: 'ibs_cbs_classification', ibsStateRate: 'ibs_state_rate',
      ibsStateReduction: 'ibs_state_reduction', ibsCityRate: 'ibs_city_rate', ibsCityReduction: 'ibs_city_reduction',
      cbsRate: 'cbs_rate', cbsReduction: 'cbs_reduction', additionalInfo: 'additional_info',
    };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, column] of Object.entries(map)) {
      const value = payload[key as keyof UpdateNfeItemDto];
      if (value !== undefined) update[column] = value;
    }
    const { data: item, error } = await this.supabaseService.admin.from('nfe_invoice_items').update(update).eq('id', itemId).eq('nfe_invoice_id', invoiceId).select('*').single();
    if (error || !item) throw new NotFoundException('Item da NF-e não encontrado.');
    if (String(item.ibs_cbs_cst) === '200' && String(item.ibs_cbs_classification) === '200003') {
      Object.assign(item, {
        ibs_state_rate: 0.1,
        ibs_state_reduction: 100,
        ibs_city_rate: 0,
        ibs_city_reduction: 100,
        cbs_rate: 0.9,
        cbs_reduction: 100,
      });
    }
    const base = Decimal.max(0, new Decimal(item.gross_value).minus(item.discount_value).plus(item.freight_value).plus(item.insurance_value).plus(item.other_value));
    const pisCst = normalizeCst(item.pis_cst);
    const cofinsCst = normalizeCst(item.cofins_cst);
    const ibsStateEffective = effectiveRate(item.ibs_state_rate, item.ibs_state_reduction);
    const ibsCityEffective = effectiveRate(item.ibs_city_rate, item.ibs_city_reduction);
    const cbsEffective = effectiveRate(item.cbs_rate, item.cbs_reduction);
    const values = {
      total_value: base.toDecimalPlaces(4).toNumber(), icms_base: base.toNumber(),
      icms_cst: normalizeCst(item.icms_cst),
      icms_value: base.mul(item.icms_rate).div(100).toDecimalPlaces(4).toNumber(),
      pis_cst: pisCst, pis_base: NON_TAXED_CONTRIBUTION_CSTS.has(pisCst) ? 0 : base.toNumber(),
      pis_rate: NON_TAXED_CONTRIBUTION_CSTS.has(pisCst) ? 0 : item.pis_rate,
      pis_value: NON_TAXED_CONTRIBUTION_CSTS.has(pisCst) ? 0 : base.mul(item.pis_rate).div(100).toDecimalPlaces(4).toNumber(),
      cofins_cst: cofinsCst, cofins_base: NON_TAXED_CONTRIBUTION_CSTS.has(cofinsCst) ? 0 : base.toNumber(),
      cofins_rate: NON_TAXED_CONTRIBUTION_CSTS.has(cofinsCst) ? 0 : item.cofins_rate,
      cofins_value: NON_TAXED_CONTRIBUTION_CSTS.has(cofinsCst) ? 0 : base.mul(item.cofins_rate).div(100).toDecimalPlaces(4).toNumber(),
      ibs_base: base.toNumber(), ibs_value: base.mul(ibsStateEffective.plus(ibsCityEffective)).div(100).toDecimalPlaces(4).toNumber(),
      cbs_base: base.toNumber(), cbs_value: base.mul(cbsEffective).div(100).toDecimalPlaces(4).toNumber(),
    };
    await this.supabaseService.admin.from('nfe_invoice_items').update({
      ...values,
      ...(String(item.ibs_cbs_cst) === '200' && String(item.ibs_cbs_classification) === '200003'
        ? {
          ibs_state_rate: item.ibs_state_rate,
          ibs_state_reduction: item.ibs_state_reduction,
          ibs_city_rate: item.ibs_city_rate,
          ibs_city_reduction: item.ibs_city_reduction,
          cbs_rate: item.cbs_rate,
          cbs_reduction: item.cbs_reduction,
        }
        : {}),
    }).eq('id', itemId);
    await this.recalculate(invoiceId, user);
    return this.validate(invoiceId, user);
  }

  async validate(id: string, user?: AuthenticatedUser) {
    const [invoice, config] = await Promise.all([this.get(id), this.configService.getRawConfig()]);
    const validation = this.validationService.validate(invoice, config);
    if (EDITABLE_STATUSES.includes(invoice.status)) {
      await this.supabaseService.admin.from('nfe_invoices').update({
        status: validation.valid ? 'VALIDADA' : 'RASCUNHO', validation_issues: validation.issues,
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      }).eq('id', id);
    }
    return { ...(await this.get(id)), validation };
  }

  async remove(id: string) {
    const invoice = await this.assertEditable(id);
    if (invoice.status !== 'RASCUNHO' && invoice.status !== 'VALIDADA' && invoice.status !== 'REJEITADA') {
      throw new BadRequestException('Apenas rascunhos ou notas rejeitadas podem ser excluídos.');
    }
    const { error } = await this.supabaseService.admin.from('nfe_invoices').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  private async assertEditable(id: string) {
    const { data, error } = await this.supabaseService.admin.from('nfe_invoices').select('id,status').eq('id', id).single();
    if (error || !data) throw new NotFoundException('NF-e não encontrada.');
    if (!EDITABLE_STATUSES.includes(data.status)) throw new BadRequestException('A NF-e não pode mais ser alterada.');
    return data;
  }

  private async recalculate(id: string, user?: AuthenticatedUser) {
    const { data: items, error } = await this.supabaseService.admin.from('nfe_invoice_items').select('*').eq('nfe_invoice_id', id);
    if (error) throw new BadRequestException(error.message);
    const sum = (field: string) => (items ?? []).reduce((total, item) => total.plus(item[field] ?? 0), new Decimal(0)).toDecimalPlaces(4).toNumber();
    await this.supabaseService.admin.from('nfe_invoices').update({
      total_products: sum('gross_value'), total_discount: sum('discount_value'), total_freight: sum('freight_value'),
      total_insurance: sum('insurance_value'), total_other: sum('other_value'), total_icms: sum('icms_value'),
      total_pis: sum('pis_value'), total_cofins: sum('cofins_value'), total_ibs: sum('ibs_value'), total_cbs: sum('cbs_value'),
      total_nfe: sum('total_value'), row_version: new Decimal(1).plus((await this.getInvoiceVersion(id))).toNumber(),
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }).eq('id', id);
  }

  private async getInvoiceVersion(id: string) {
    const { data } = await this.supabaseService.admin.from('nfe_invoices').select('row_version').eq('id', id).single();
    return Number(data?.row_version ?? 0);
  }

  private issuerSnapshot(config: Record<string, any>) {
    const hidden = new Set(['certificate_path', 'certificate_password_encrypted', 'certificate_fingerprint']);
    return Object.fromEntries(Object.entries(config).filter(([key]) => !hidden.has(key)));
  }
}
