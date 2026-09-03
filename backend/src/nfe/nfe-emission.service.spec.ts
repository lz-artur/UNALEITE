import { NfeEmissionService } from './nfe-emission.service';

describe('NfeEmissionService XML data', () => {
  const service = new NfeEmissionService({} as any, {} as any, {} as any, {} as any);

  it('gera CST 06 sem base de PIS/COFINS e redução integral do IBS/CBS', () => {
    const config = {
      cnpj: '55219063000125', environment: 'homologacao', state: 'PE', city_code: '2613008',
      legal_name: 'JPS UNAMILK LTDA', state_registration: '117362832', tax_regime: 3,
      address: 'SITIO SERROTE DO GADO BRAVO', address_number: '160', neighborhood: 'ZONA RURAL',
      city_name: 'SÃO BENTO DO UNA', cep: '55370000', country_code: '1058', country_name: 'Brasil',
      application_version: 'UNA-NFE-1.0',
    };
    const invoice = {
      numeric_code: '12345678', number: 30, series: 2, issued_at: '2026-09-02T12:00:00-03:00',
      nature_of_operation: 'VENDA DE PRODUCAO DO ESTABELECIMENTO', operation_type: 1,
      purpose: 1, final_consumer: false, presence_indicator: 2, freight_mode: 0,
      issuer_snapshot: config,
      recipient_snapshot: {
        name: 'PACHECO DISTRIBUIDORA DE ALIMENTOS LTDA', document: '21196210000177',
        state_registration: '059609672', ie_indicator: '1', address: 'SITIO LAGOA DO ALGODAO',
        address_number: '177', neighborhood: 'ZONA RURAL', city_code: '2604106', city: 'CARUARU',
        state: 'PE', cep: '55000000', country_code: '1058', country_name: 'Brasil',
        email: 'bruno@pachecodistribuidora.com.br, financeiro@pachecodistribuidora.com.br',
      },
      payment_snapshot: { method_code: '15' },
      total_products: 100, total_freight: 0, total_insurance: 0, total_discount: 0,
      total_other: 0, total_icms: 20.5, total_pis: 0, total_cofins: 0,
      total_ibs: 0, total_cbs: 0, total_nfe: 100,
      items: [{
        product_code: '1861', fiscal_name_snapshot: 'QUEIJO TIPO MUSSARELA', ncm: '04061010',
        cfop: '5101', commercial_unit_symbol: 'KG', tax_unit_symbol: 'KG', commercial_quantity: 10,
        tax_quantity: 10, unit_price: 10, gross_value: 100, freight_value: 0, insurance_value: 0,
        discount_value: 0, other_value: 0, goods_origin: '0', icms_cst: '000', icms_base: 100,
        icms_rate: 20.5, icms_value: 20.5, pis_cst: '06', pis_base: 0, pis_rate: 0, pis_value: 0,
        cofins_cst: '06', cofins_base: 0, cofins_rate: 0, cofins_value: 0,
        ibs_cbs_cst: '200', ibs_cbs_classification: '200003', ibs_base: 100,
        ibs_state_rate: 0.1, ibs_state_reduction: 100, ibs_city_rate: 0,
        ibs_city_reduction: 100, ibs_value: 0, cbs_rate: 0.9, cbs_reduction: 100, cbs_value: 0,
      }],
    };

    const result = (service as any).buildNfe(invoice, config);
    const info = result.NFe.infNFe;
    const tax = info.det[0].imposto;

    expect(info.ide).toMatchObject({ tpNF: 1, cDV: 0, indPres: 2 });
    expect(Object.keys(info.ide).indexOf('cDV')).toBeLessThan(Object.keys(info.ide).indexOf('tpAmb'));
    expect(Object.keys(info.emit).indexOf('enderEmit')).toBeLessThan(Object.keys(info.emit).indexOf('IE'));
    expect(info.dest.email).toBe('bruno@pachecodistribuidora.com.br');
    expect(tax.ICMS.dadosICMS).toMatchObject({ orig: 0, CST: '00' });
    expect(tax.PIS).toEqual({ PISNT: { CST: '06' } });
    expect(tax.COFINS).toEqual({ COFINSNT: { CST: '06' } });
    expect(tax.IBSCBS.cClassTrib).toBe('200003');
    expect(tax.IBSCBS.gIBSCBS.gIBSUF.gRed).toMatchObject({ pRedAliq: 100, pAliqEfet: '0.0000' });
    expect(tax.IBSCBS.gIBSCBS.gCBS.gRed).toMatchObject({ pRedAliq: 100, pAliqEfet: '0.0000' });
    expect(info.total.vNFTot).toBe('100.00');
    expect(info.total.IBSCBSTot.vNFTot).toBeUndefined();
    expect(info.pag.detPag).toMatchObject({ indPag: 1, tPag: '15', vPag: '100.00' });
  });

  it('distingue erro local de XML de falha incerta de comunicação', () => {
    expect((service as any).isLocalXmlValidationError(
      "NFE_Autorizacao: Erro Não Identificado na Validação do XML: Element 'tpAmb'",
    )).toBe(true);
    expect((service as any).isLocalXmlValidationError('connect ETIMEDOUT')).toBe(false);
  });
});
