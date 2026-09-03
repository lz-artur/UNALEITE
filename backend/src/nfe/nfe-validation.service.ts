import { Injectable } from '@nestjs/common';

export interface NfeValidationIssue {
  section: 'emitente' | 'destinatario' | 'itens' | 'nota' | 'certificado';
  field: string;
  message: string;
  itemId?: string;
}

@Injectable()
export class NfeValidationService {
  validate(invoice: Record<string, any>, config: Record<string, any>) {
    const issues: NfeValidationIssue[] = [];
    const required = (
      section: NfeValidationIssue['section'],
      source: Record<string, any>,
      field: string,
      message: string,
      itemId?: string,
    ) => {
      const value = source?.[field];
      if (value === undefined || value === null || String(value).trim() === '') {
        issues.push({ section, field, message, itemId });
      }
    };

    required('emitente', config, 'legal_name', 'Informe a razão social do emitente.');
    required('emitente', config, 'cnpj', 'Informe o CNPJ do emitente.');
    required('emitente', config, 'state_registration', 'Informe a inscrição estadual do emitente.');
    required('emitente', config, 'tax_regime', 'Informe o regime tributário (CRT).');
    required('emitente', config, 'address', 'Informe o logradouro do emitente.');
    required('emitente', config, 'address_number', 'Informe o número do emitente.');
    required('emitente', config, 'neighborhood', 'Informe o bairro do emitente.');
    required('emitente', config, 'city_code', 'Informe o código IBGE do município do emitente.');
    required('emitente', config, 'city_name', 'Informe o município do emitente.');
    required('emitente', config, 'cep', 'Informe o CEP do emitente.');
    if (!config.certificate_path) issues.push({ section: 'certificado', field: 'certificate', message: 'Envie o certificado digital A1.' });
    if (config.certificate_expires_at && new Date(config.certificate_expires_at) <= new Date()) {
      issues.push({ section: 'certificado', field: 'certificate', message: 'O certificado digital está vencido.' });
    }

    const recipient = invoice.recipient_snapshot ?? {};
    required('destinatario', recipient, 'name', 'Informe o nome/razão social do destinatário.');
    required('destinatario', recipient, 'document', 'Informe o CPF/CNPJ do destinatário.');
    required('destinatario', recipient, 'address', 'Informe o logradouro do destinatário.');
    required('destinatario', recipient, 'address_number', 'Informe o número do destinatário.');
    required('destinatario', recipient, 'neighborhood', 'Informe o bairro do destinatário.');
    required('destinatario', recipient, 'city_code', 'Informe o código IBGE do município do destinatário.');
    required('destinatario', recipient, 'city', 'Informe o município do destinatário.');
    required('destinatario', recipient, 'state', 'Informe a UF do destinatário.');
    required('destinatario', recipient, 'cep', 'Informe o CEP do destinatário.');
    required('destinatario', recipient, 'ie_indicator', 'Informe o indicador de inscrição estadual do destinatário.');
    if (String(recipient.ie_indicator) === '1') {
      required('destinatario', recipient, 'state_registration', 'Informe a inscrição estadual do destinatário contribuinte.');
    }

    required('nota', invoice, 'nature_of_operation', 'Informe a natureza da operação.');
    if (![0, 1].includes(Number(invoice.operation_type ?? 1))) {
      issues.push({ section: 'nota', field: 'operation_type', message: 'Selecione entrada ou saída para o tipo da nota.' });
    }
    if (![0, 1, 2, 3, 4, 5, 9].includes(Number(invoice.presence_indicator))) {
      issues.push({ section: 'nota', field: 'presence_indicator', message: 'Selecione um indicador de presença válido.' });
    }
    if (![0, 1, 2, 9].includes(Number(invoice.freight_mode))) {
      issues.push({ section: 'nota', field: 'freight_mode', message: 'Selecione uma modalidade de frete válida.' });
    }
    const paymentMethod = String(invoice.payment_snapshot?.method_code ?? '');
    if (!['01', '03', '04', '15', '17', '20', '90', '99'].includes(paymentMethod)) {
      issues.push({ section: 'nota', field: 'payment_method', message: 'Selecione a forma de pagamento.' });
    }
    if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
      issues.push({ section: 'itens', field: 'items', message: 'A nota precisa ter ao menos um item.' });
    }
    for (const item of invoice.items ?? []) {
      const id = String(item.id);
      required('itens', item, 'product_code', 'Informe o código fiscal do produto.', id);
      required('itens', item, 'fiscal_name_snapshot', 'Informe o nome fiscal do produto.', id);
      required('itens', item, 'ncm', 'Informe o NCM do produto.', id);
      required('itens', item, 'cfop', 'Informe o CFOP do produto.', id);
      required('itens', item, 'goods_origin', 'Informe a origem da mercadoria.', id);
      required('itens', item, 'commercial_unit_symbol', 'Informe a unidade comercial.', id);
      required('itens', item, 'tax_unit_symbol', 'Informe a unidade tributável.', id);
      required('itens', item, 'icms_cst', 'Informe o CST do ICMS.', id);
      required('itens', item, 'pis_cst', 'Informe o CST do PIS.', id);
      required('itens', item, 'cofins_cst', 'Informe o CST da COFINS.', id);
      required('itens', item, 'ibs_cbs_cst', 'Informe o CST do IBS/CBS.', id);
      required('itens', item, 'ibs_cbs_classification', 'Informe a classificação tributária IBS/CBS.', id);
      if (!/^\d{8}$/.test(String(item.ncm ?? '').replace(/\D/g, ''))) {
        issues.push({ section: 'itens', field: 'ncm', message: 'O NCM deve ter 8 dígitos.', itemId: id });
      }
      if (!/^\d{4}$/.test(String(item.cfop ?? '').replace(/\D/g, ''))) {
        issues.push({ section: 'itens', field: 'cfop', message: 'O CFOP deve ter 4 dígitos.', itemId: id });
      }
      if (!/^[0-8]$/.test(String(item.goods_origin ?? ''))) {
        issues.push({ section: 'itens', field: 'goods_origin', message: 'A origem deve ser um código entre 0 e 8.', itemId: id });
      }
      if (!/^\d{6}$/.test(String(item.ibs_cbs_classification ?? ''))) {
        issues.push({ section: 'itens', field: 'ibs_cbs_classification', message: 'A classificação IBS/CBS deve ter 6 dígitos.', itemId: id });
      }
    }

    const fieldChecks = 14 + (invoice.items?.length ?? 0) * 11;
    const completionPercentage = fieldChecks === 0 ? 0 : Math.max(0, Math.round(((fieldChecks - issues.length) / fieldChecks) * 100));
    return { valid: issues.length === 0, completionPercentage, issues };
  }
}
