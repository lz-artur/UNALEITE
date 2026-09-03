import { NfeValidationService } from './nfe-validation.service';

describe('NfeValidationService', () => {
  const service = new NfeValidationService();
  const config = {
    legal_name: 'JPS UNAMILK LTDA', cnpj: '55219063000125', state_registration: '117362832',
    tax_regime: 3, address: 'Rua A', address_number: '10', neighborhood: 'Centro',
    city_code: '2611606', city_name: 'Recife', cep: '50000000', certificate_path: 'cert.pfx',
    certificate_expires_at: '2030-01-01T00:00:00.000Z',
  };
  const invoice = {
    nature_of_operation: 'Venda de produção',
    operation_type: 1,
    presence_indicator: 2,
    freight_mode: 0,
    payment_snapshot: { method_code: '15' },
    recipient_snapshot: {
      name: 'Cliente', document: '12345678000100', address: 'Rua B', address_number: '20',
      neighborhood: 'Centro', city_code: '2611606', city: 'Recife', state: 'PE', cep: '50000000', ie_indicator: '9',
    },
    items: [{
      id: 'item-1', product_code: '1861', fiscal_name_snapshot: 'QUEIJO MUSSARELA', ncm: '04061090', cfop: '5101',
      goods_origin: '0', commercial_unit_symbol: 'KG', tax_unit_symbol: 'KG',
      icms_cst: '00', pis_cst: '01', cofins_cst: '01', ibs_cbs_cst: '000', ibs_cbs_classification: '000001',
    }],
  };

  it('aceita uma nota completa', () => {
    expect(service.validate(invoice, config)).toMatchObject({ valid: true, completionPercentage: 100, issues: [] });
  });

  it('exige o nome fiscal sem usar o nome interno como substituto', () => {
    const result = service.validate({ ...invoice, items: [{ ...invoice.items[0], fiscal_name_snapshot: '' }] }, config);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'fiscal_name_snapshot', itemId: 'item-1' }),
    ]));
  });

  it('bloqueia certificado vencido', () => {
    const result = service.validate(invoice, { ...config, certificate_expires_at: '2020-01-01T00:00:00.000Z' });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'certificado', field: 'certificate' }),
    ]));
  });
});
