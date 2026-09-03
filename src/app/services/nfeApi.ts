import { apiRequest } from './api';

export type NfeStatus = 'RASCUNHO' | 'VALIDADA' | 'AUTORIZANDO' | 'AUTORIZADA' | 'REJEITADA' | 'PENDENTE_CONCILIACAO' | 'CANCELANDO' | 'CANCELADA';

export interface NfeValidationIssue {
  section: string;
  field: string;
  message: string;
  itemId?: string;
}

export interface NfeItem {
  id: string;
  item_number: number;
  product_code: string;
  product_name_snapshot: string;
  fiscal_name_snapshot?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  goods_origin?: string;
  commercial_unit_symbol?: string;
  tax_unit_symbol?: string;
  commercial_quantity: number;
  unit_price: number;
  gross_value: number;
  discount_value: number;
  total_value: number;
  icms_cst?: string;
  icms_rate: number;
  pis_cst?: string;
  pis_rate: number;
  cofins_cst?: string;
  cofins_rate: number;
  ibs_cbs_cst?: string;
  ibs_cbs_classification?: string;
  ibs_state_rate: number;
  ibs_state_reduction: number;
  ibs_city_rate: number;
  ibs_city_reduction: number;
  cbs_rate: number;
  cbs_reduction: number;
  additional_info?: string;
}

export interface NfeInvoice {
  id: string;
  sales_order_id: string;
  status: NfeStatus;
  environment: 'homologacao' | 'producao';
  series: number;
  number?: number;
  access_key?: string;
  protocol_number?: string;
  nature_of_operation?: string;
  operation_type: number;
  purpose: number;
  presence_indicator: number;
  final_consumer: boolean;
  freight_mode: number;
  recipient_snapshot: Record<string, any>;
  payment_snapshot: Record<string, any>;
  additional_info?: string;
  fiscal_additional_info?: string;
  total_products: number;
  total_icms: number;
  total_pis: number;
  total_cofins: number;
  total_ibs: number;
  total_cbs: number;
  total_nfe: number;
  rejection_code?: string;
  rejection_reason?: string;
  validation_issues?: NfeValidationIssue[];
  created_at: string;
  authorized_at?: string;
  items?: NfeItem[];
  sales_order?: { id: string; order_number: string };
  client?: { id: string; name: string; document: string };
  validation?: { valid: boolean; completionPercentage: number; issues: NfeValidationIssue[] };
}

export interface NfeConfig {
  id: string;
  legal_name: string;
  trade_name?: string;
  cnpj: string;
  state_registration: string;
  tax_regime?: number;
  cnae?: string;
  address?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city_code?: string;
  city_name?: string;
  state: string;
  cep?: string;
  country_code: string;
  country_name: string;
  phone?: string;
  environment: 'homologacao' | 'producao';
  series: number;
  initial_number: number;
  application_version: string;
  default_nature_of_operation: string;
  default_icms_rate: number;
  default_pis_rate: number;
  default_cofins_rate: number;
  default_additional_info?: string;
  certificate_configured: boolean;
  certificate_subject?: string;
  certificate_expires_at?: string;
}

export interface EligibleOrder {
  id: string;
  order_number: string;
  order_date: string;
  total_amount: number;
  client?: { name: string; document: string };
}

export const listNfe = (filters?: { status?: string; search?: string }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  return apiRequest<NfeInvoice[]>(`/nfe${params.size ? `?${params}` : ''}`);
};
export const listEligibleOrders = () => apiRequest<EligibleOrder[]>('/nfe/eligible-orders');
export const getNfe = (id: string) => apiRequest<NfeInvoice>(`/nfe/${id}`);
export const createNfeDraft = (salesOrderId: string) => apiRequest<NfeInvoice>('/nfe/drafts', { method: 'POST', body: JSON.stringify({ salesOrderId }) });
export const updateNfe = (id: string, payload: Record<string, unknown>) => apiRequest<NfeInvoice>(`/nfe/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const updateNfeItem = (id: string, itemId: string, payload: Record<string, unknown>) => apiRequest<NfeInvoice>(`/nfe/${id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const validateNfe = (id: string) => apiRequest<NfeInvoice>(`/nfe/${id}/validate`, { method: 'POST' });
export const authorizeNfe = (id: string) => apiRequest<NfeInvoice>(`/nfe/${id}/authorize`, { method: 'POST' });
export const reconcileNfe = (id: string) => apiRequest<NfeInvoice>(`/nfe/${id}/reconcile`, { method: 'POST' });
export const cancelNfe = (id: string, justification: string) => apiRequest<NfeInvoice>(`/nfe/${id}/cancel`, { method: 'POST', body: JSON.stringify({ justification }) });
export const deleteNfe = (id: string) => apiRequest<{ success: boolean }>(`/nfe/${id}`, { method: 'DELETE' });
export const getNfeConfig = () => apiRequest<NfeConfig>('/nfe/config');
export const updateNfeConfig = (payload: Record<string, unknown>) => apiRequest<NfeConfig>('/nfe/config', { method: 'PUT', body: JSON.stringify(payload) });
export const uploadNfeCertificate = (certificate: File, password: string) => {
  const body = new FormData();
  body.append('certificate', certificate);
  body.append('password', password);
  return apiRequest<NfeConfig>('/nfe/config/certificate', { method: 'POST', body });
};
export const testSefazStatus = () => apiRequest<any>('/nfe/sefaz/status');
export const getNfeAsset = (id: string, type: 'xml' | 'danfe') => apiRequest<{ url: string }>(`/nfe/${id}/${type}`);
