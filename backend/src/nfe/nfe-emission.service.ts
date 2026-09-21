import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'crypto';
import type { Cancelamento, NFe } from '@nfewizard/types/nfe';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { NfeConfigService } from './nfe-config.service';
import { NfeSefazService } from './nfe-sefaz.service';
import { NfeService } from './nfe.service';

@Injectable()
export class NfeEmissionService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly nfeService: NfeService,
    private readonly configService: NfeConfigService,
    private readonly sefazService: NfeSefazService,
  ) {}

  status() {
    return this.sefazService.status();
  }

  async authorize(id: string, user?: AuthenticatedUser, duplicateRetry = 0): Promise<any> {
    const validated = await this.nfeService.validate(id, user);
    if (!validated.validation.valid) {
      throw new BadRequestException({ message: 'Complete os dados obrigatórios antes de autorizar.', issues: validated.validation.issues });
    }
    if (validated.status === 'AUTORIZADA') return validated;
    if (!['VALIDADA', 'REJEITADA', 'RASCUNHO'].includes(validated.status)) {
      throw new BadRequestException('Esta NF-e não pode ser autorizada no estado atual.');
    }

    const config = await this.configService.getRawConfig();
    const invoiceEnvironment = validated.environment as 'homologacao' | 'producao';
    const invoiceSeries = Number(validated.series);
    const emissionConfig = { ...config, environment: invoiceEnvironment, series: invoiceSeries };
    let number = validated.number as number | null;
    let numericCode = validated.numeric_code as string | null;
    const issuedAt = validated.issued_at ?? this.nowWithOffset();
    if (!number) {
      const { data, error } = await this.supabaseService.admin.rpc('reserve_nfe_number', {
        p_issuer_cnpj: config.cnpj, p_environment: invoiceEnvironment, p_model: 55, p_series: invoiceSeries,
        p_initial_number: config.initial_number ?? 1,
      });
      if (error || !data) throw new BadRequestException(error?.message ?? 'Não foi possível reservar o número da NF-e.');
      number = Number(data);
      numericCode = String(randomInt(0, 100_000_000)).padStart(8, '0');
    }
    const expectedAccessKey = this.buildAccessKey(config.cnpj, issuedAt, invoiceSeries, number, numericCode!);
    await this.supabaseService.admin.from('nfe_invoices').update({
      number, numeric_code: numericCode, access_key: expectedAccessKey, issued_at: issuedAt, status: 'AUTORIZANDO',
      rejection_code: null, rejection_reason: null, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }).eq('id', id);

    const invoice = await this.nfeService.get(id);
    const data = this.buildNfe(invoice, emissionConfig);
    const attempt = await this.nextAttempt(id, 'AUTORIZACAO');
    const transmissionId = await this.startTransmission(id, 'AUTORIZACAO', attempt, data, user);
    const started = Date.now();
    try {
      const response = await this.sefazService.authorize(data, invoiceEnvironment);
      const protocol = this.findProtocol(response.result);
      const statusCode = String(protocol?.cStat ?? this.findValue(response.result, 'cStat') ?? '');
      const reason = String(protocol?.xMotivo ?? this.findValue(response.result, 'xMotivo') ?? 'Resposta não identificada da SEFAZ');
      const accessKey = String(protocol?.chNFe ?? this.findValue(response.result, 'chNFe') ?? '');
      const protocolNumber = String(protocol?.nProt ?? this.findValue(response.result, 'nProt') ?? '');
      await this.finishTransmission(transmissionId, statusCode, reason, Date.now() - started, response.result);

      if (statusCode === '100' && accessKey && protocolNumber) {
        const xml = this.bestXml(response.xmlFiles, accessKey);
        const xmlPath = xml ? await this.upload('nfe-xml', `${invoiceEnvironment}/${accessKey}-procNFe.xml`, Buffer.from(xml), 'application/xml') : null;
        let danfePath: string | null = null;
        try {
          const danfe = await this.sefazService.generateDanfe(xml, accessKey);
          danfePath = await this.upload('nfe-danfe', `${invoiceEnvironment}/${accessKey}-danfe.pdf`, danfe, 'application/pdf');
        } catch {
          // A autorização fiscal permanece válida mesmo se a representação gráfica falhar.
        }
        await this.supabaseService.admin.from('nfe_invoices').update({
          status: 'AUTORIZADA', access_key: accessKey, protocol_number: protocolNumber,
          authorized_at: protocol?.dhRecbto ?? new Date().toISOString(), xml_authorized_path: xmlPath,
          danfe_path: danfePath, rejection_code: null, rejection_reason: null,
          schema_version: '4.00', library_version: 'nfewizard-io@1.1.2', updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
        }).eq('id', id);
        await this.supabaseService.admin.from('financial_entries').update({ nfe_invoice_id: id, updated_by: user?.id ?? null })
          .eq('reference_table', 'sales_orders').eq('reference_id', invoice.sales_order_id);
      } else if (statusCode === '539') {
        return this.retryWithNextNumber(id, invoice, reason, duplicateRetry, user);
      } else {
        await this.supabaseService.admin.from('nfe_invoices').update({
          status: 'REJEITADA', rejection_code: statusCode || null, rejection_reason: reason,
          updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
        }).eq('id', id);
      }
      return this.nfeService.get(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha de comunicação com a SEFAZ.';
      const localXmlValidationError = this.isLocalXmlValidationError(message);
      const isRejection = /Rejei(?:ç|c)[aã]o:/i.test(message);
      const duplicate = this.parseDuplicateRejection(message);
      await this.finishTransmission(
        transmissionId,
        localXmlValidationError ? 'VALIDACAO_XML_LOCAL' : (duplicate ? '539' : (isRejection ? 'REJEICAO_NEGOCIO' : 'INDETERMINADO')),
        message,
        Date.now() - started,
        {},
      );
      if (duplicate) {
        return this.retryWithNextNumber(id, invoice, message, duplicateRetry, user);
      }
      await this.supabaseService.admin.from('nfe_invoices').update({
        status: (localXmlValidationError || isRejection) ? 'REJEITADA' : 'PENDENTE_CONCILIACAO',
        rejection_code: localXmlValidationError ? 'VALIDACAO_XML_LOCAL' : null,
        rejection_reason: message,
        updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      }).eq('id', id);
      if (localXmlValidationError) {
        throw new BadRequestException('O XML da NF-e não passou na validação local e não foi enviado à SEFAZ. Corrija os dados e tente novamente.');
      }
      if (isRejection) {
        throw new BadRequestException(message.replace(/^.*?Rejei(?:ç|c)[aã]o:\s*/i, 'Rejeição: '));
      }
      const httpReason = message.match(/HTTP \d{3}(?::.*)?$/i)?.[0];
      if (httpReason) {
        throw new BadRequestException(`A SEFAZ respondeu com ${httpReason}. Consulte a situação antes de tentar novamente.`);
      }
      throw new BadRequestException('A resposta da SEFAZ não foi confirmada. Consulte a situação antes de tentar novamente.');
    }
  }

  async reconcile(id: string, user?: AuthenticatedUser) {
    const invoice = await this.nfeService.get(id);
    if (!invoice.access_key) throw new BadRequestException('A chave de acesso ainda não está disponível para consulta.');
    let response: any;
    try {
      response = await this.sefazService.query(
        invoice.access_key,
        invoice.environment as 'homologacao' | 'producao',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha de comunicação com a SEFAZ.';
      const isRejection = /Rejei(?:ç|c)[aã]o:/i.test(message);
      if (isRejection) {
        await this.supabaseService.admin.from('nfe_invoices').update({
          status: 'REJEITADA',
          rejection_code: null,
          rejection_reason: message,
          updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
        }).eq('id', id);
        throw new BadRequestException(`A consulta retornou: ${message.replace(/^.*?Rejei(?:ç|c)[aã]o:\s*/i, 'Rejeição: ')}. A nota foi marcada como rejeitada e pode ser reenviada.`);
      }
      throw new BadRequestException(`Não foi possível consultar a SEFAZ no momento: ${message}`);
    }
    const protocol = this.findProtocol(response);
    const statusCode = String(protocol?.cStat ?? this.findValue(response, 'cStat') ?? '');
    const reason = String(protocol?.xMotivo ?? this.findValue(response, 'xMotivo') ?? '');
    if (statusCode === '100') {
      await this.supabaseService.admin.from('nfe_invoices').update({
        status: 'AUTORIZADA', protocol_number: protocol?.nProt ?? invoice.protocol_number,
        authorized_at: protocol?.dhRecbto ?? invoice.authorized_at ?? new Date().toISOString(),
        rejection_code: null, rejection_reason: null, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      }).eq('id', id);
    } else if (statusCode) {
      await this.supabaseService.admin.from('nfe_invoices').update({ rejection_code: statusCode, rejection_reason: reason, updated_at: new Date().toISOString() }).eq('id', id);
    }
    return this.nfeService.get(id);
  }

  async cancel(id: string, justification: string, user?: AuthenticatedUser) {
    const invoice = await this.nfeService.get(id);
    if (invoice.status !== 'AUTORIZADA' || !invoice.access_key || !invoice.protocol_number) {
      throw new BadRequestException('Somente uma NF-e autorizada pode ser cancelada.');
    }
    const invoiceEnvironment = invoice.environment as 'homologacao' | 'producao';
    const issuerCnpj = String(invoice.issuer_snapshot?.cnpj ?? invoice.access_key.slice(6, 20)).replace(/\D/g, '');
    const data: Cancelamento = {
      idLote: Date.now(), modelo: '55', evento: [{
        tpAmb: invoiceEnvironment === 'producao' ? 1 : 2,
        cOrgao: Number(invoice.access_key.slice(0, 2)),
        CNPJ: issuerCnpj,
        chNFe: invoice.access_key,
        dhEvento: this.nowWithOffset(), tpEvento: '110111', nSeqEvento: 1, verEvento: '1.00',
        detEvento: { descEvento: 'Cancelamento', nProt: invoice.protocol_number, xJust: justification },
      }],
    };
    await this.supabaseService.admin.from('nfe_invoices').update({ status: 'CANCELANDO' }).eq('id', id);
    let response: any;
    try {
      response = await this.sefazService.cancel(data, invoiceEnvironment);
    } catch (error) {
      await this.supabaseService.admin.from('nfe_invoices').update({ status: 'AUTORIZADA' }).eq('id', id);
      const message = error instanceof Error ? error.message : 'Falha de comunicação com a SEFAZ.';
      throw new BadRequestException(`Não foi possível cancelar a NF-e no momento: ${message}`);
    }
    const statusCode = String(this.findValue(response.result, 'cStat') ?? '');
    const reason = String(this.findValue(response.result, 'xMotivo') ?? '');
    const accepted = ['135', '136', '155'].includes(statusCode);
    await this.supabaseService.admin.from('nfe_events').insert({
      nfe_invoice_id: id, event_type: 'CANCELAMENTO', sequence: 1,
      status: accepted ? 'REGISTRADO' : 'REJEITADO', protocol_number: this.findValue(response.result, 'nProt'),
      response_code: statusCode, response_message: reason, justification, created_by: user?.id ?? null,
    });
    await this.supabaseService.admin.from('nfe_invoices').update({
      status: accepted ? 'CANCELADA' : 'AUTORIZADA', canceled_at: accepted ? new Date().toISOString() : null,
      rejection_code: accepted ? null : statusCode, rejection_reason: accepted ? null : reason,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }).eq('id', id);
    return this.nfeService.get(id);
  }

  async signedAssetUrl(id: string, type: 'xml' | 'danfe') {
    const invoice = await this.nfeService.get(id);
    let path = type === 'xml' ? invoice.xml_authorized_path : invoice.danfe_path;
    if (type === 'danfe' && !path && invoice.xml_authorized_path && invoice.access_key) {
      const { data: xmlBlob, error: xmlError } = await this.supabaseService.admin.storage
        .from('nfe-xml')
        .download(invoice.xml_authorized_path);
      if (xmlError || !xmlBlob) throw new BadRequestException('Não foi possível carregar o XML autorizado para gerar o DANFE.');
      const danfe = await this.sefazService.generateDanfe(await xmlBlob.text(), invoice.access_key);
      path = await this.upload(
        'nfe-danfe',
        `${invoice.environment}/${invoice.access_key}-danfe.pdf`,
        danfe,
        'application/pdf',
      );
      const { error: updateError } = await this.supabaseService.admin
        .from('nfe_invoices')
        .update({ danfe_path: path, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateError) throw new BadRequestException('O DANFE foi gerado, mas não foi possível vinculá-lo à NF-e.');
    }
    if (!path) throw new BadRequestException(`${type.toUpperCase()} ainda não está disponível.`);
    const bucket = type === 'xml' ? 'nfe-xml' : 'nfe-danfe';
    const { data, error } = await this.supabaseService.admin.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data) throw new BadRequestException('Não foi possível gerar o link de download.');
    return { url: data.signedUrl, expiresIn: 300 };
  }

  private buildNfe(invoice: Record<string, any>, config: Record<string, any>): NFe {
    const recipient = invoice.recipient_snapshot;
    const homologationName = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
    const str = (value: unknown) => typeof value === 'string' ? value.trim() : (value !== null && value !== undefined ? String(value).trim() : undefined as any);
    const money = (value: unknown) => Number(value ?? 0).toFixed(2);
    const rate = (value: unknown) => Number(value ?? 0).toFixed(4);
    const effectiveRate = (nominal: unknown, reduction: unknown) => Number(nominal ?? 0) * (1 - Number(reduction ?? 0) / 100);
    const pis = (item: any) => {
      const cst = String(item.pis_cst).padStart(2, '0');
      if (['04', '05', '06', '07', '08', '09'].includes(cst)) return { PISNT: { CST: cst } };
      if (['01', '02'].includes(cst)) return { PISAliq: { CST: cst, vBC: money(item.pis_base), pPIS: rate(item.pis_rate), vPIS: money(item.pis_value) } };
      return { dadosPIS: { CST: cst, vBC: money(item.pis_base), pPIS: rate(item.pis_rate), vPIS: money(item.pis_value) } };
    };
    const cofins = (item: any) => {
      const cst = String(item.cofins_cst).padStart(2, '0');
      if (['04', '05', '06', '07', '08', '09'].includes(cst)) return { COFINSNT: { CST: cst } };
      if (['01', '02'].includes(cst)) return { COFINSAliq: { CST: cst, vBC: money(item.cofins_base), pCOFINS: rate(item.cofins_rate), vCOFINS: money(item.cofins_value) } };
      return { dadosCOFINS: { CST: cst, vBC: money(item.cofins_base), pCOFINS: rate(item.cofins_rate), vCOFINS: money(item.cofins_value) } };
    };
    const details = invoice.items.map((item: any) => ({
      prod: {
        cProd: item.product_code, cEAN: 'SEM GTIN', xProd: item.fiscal_name_snapshot,
        NCM: String(item.ncm).replace(/\D/g, ''), ...(item.cest ? { CEST: String(item.cest).replace(/\D/g, '') } : {}),
        CFOP: Number(String(item.cfop).replace(/\D/g, '')), uCom: item.commercial_unit_symbol,
        qCom: Number(item.commercial_quantity), vUnCom: Number(item.unit_price).toFixed(10), vProd: money(item.gross_value),
        cEANTrib: 'SEM GTIN', uTrib: item.tax_unit_symbol, qTrib: Number(item.tax_quantity),
        vUnTrib: Number(item.unit_price).toFixed(10), ...(Number(item.freight_value) ? { vFrete: money(item.freight_value) } : {}),
        ...(Number(item.insurance_value) ? { vSeg: money(item.insurance_value) } : {}),
        ...(Number(item.discount_value) ? { vDesc: money(item.discount_value) } : {}),
        ...(Number(item.other_value) ? { vOutro: money(item.other_value) } : {}), indTot: 1,
      },
      imposto: {
        ICMS: { dadosICMS: { orig: Number(item.goods_origin), CST: String(item.icms_cst).replace(/\D/g, '').slice(-2).padStart(2, '0'), modBC: 3, vBC: money(item.icms_base), pICMS: rate(item.icms_rate), vICMS: money(item.icms_value) } },
        PIS: pis(item), COFINS: cofins(item),
        IBSCBS: { CST: item.ibs_cbs_cst, cClassTrib: item.ibs_cbs_classification, gIBSCBS: {
          vBC: money(item.ibs_base),
          gIBSUF: { pIBSUF: rate(item.ibs_state_rate),
            ...(Number(item.ibs_state_reduction) > 0
              ? { gRed: { pRedAliq: Number(item.ibs_state_reduction), pAliqEfet: rate(effectiveRate(item.ibs_state_rate, item.ibs_state_reduction)) } }
              : {}),
            vIBSUF: money(Number(item.ibs_base) * effectiveRate(item.ibs_state_rate, item.ibs_state_reduction) / 100) },
          gIBSMun: { pIBSMun: rate(item.ibs_city_rate),
            ...(Number(item.ibs_city_reduction) > 0
              ? { gRed: { pRedAliq: Number(item.ibs_city_reduction), pAliqEfet: rate(effectiveRate(item.ibs_city_rate, item.ibs_city_reduction)) } }
              : {}),
            vIBSMun: money(Number(item.ibs_base) * effectiveRate(item.ibs_city_rate, item.ibs_city_reduction) / 100) },
          vIBS: money(item.ibs_value), gCBS: { pCBS: rate(item.cbs_rate),
            ...(Number(item.cbs_reduction) > 0
              ? { gRed: { pRedAliq: Number(item.cbs_reduction), pAliqEfet: rate(effectiveRate(item.cbs_rate, item.cbs_reduction)) } }
              : {}),
            vCBS: money(item.cbs_value) },
        } },
      },
      ...(item.additional_info ? { infAdProd: item.additional_info } : {}),
    }));
    const issuer = invoice.issuer_snapshot;
    const interstate = String(recipient.state).toUpperCase() !== String(config.state).toUpperCase();
    const recipientEmail = this.fiscalEmail(recipient.email);
    return {
      idLote: Date.now(), indSinc: 1,
      NFe: { infNFe: {
        ide: {
          cUF: 26, cNF: invoice.numeric_code, natOp: invoice.nature_of_operation, mod: 55,
          serie: String(invoice.series), nNF: invoice.number, dhEmi: invoice.issued_at,
          tpNF: Number(invoice.operation_type ?? 1), idDest: interstate ? 2 : 1, cMunFG: Number(config.city_code), tpImp: 1,
          tpEmis: 1,
          cDV: Number(this.buildAccessKey(config.cnpj, invoice.issued_at, invoice.series, invoice.number, invoice.numeric_code).slice(-1)),
          tpAmb: config.environment === 'producao' ? 1 : 2, finNFe: invoice.purpose,
          indFinal: invoice.final_consumer ? 1 : 0, indPres: invoice.presence_indicator,
          ...( [2, 3, 4, 9].includes(Number(invoice.presence_indicator)) ? { indIntermed: 0 } : {} ),
          procEmi: 0,
          verProc: config.application_version,
        },
        emit: {
          CNPJCPF: String(config.cnpj).replace(/\D/g, ''), xNome: str(config.legal_name),
          ...(config.trade_name ? { xFant: str(config.trade_name) } : {}),
          enderEmit: { xLgr: str(config.address), nro: str(config.address_number), ...(config.address_complement ? { xCpl: str(config.address_complement) } : {}),
            xBairro: str(config.neighborhood), cMun: Number(config.city_code), xMun: str(config.city_name), UF: str(config.state),
            CEP: String(config.cep).replace(/\D/g, ''), cPais: Number(config.country_code), xPais: str(config.country_name),
            ...(config.phone ? { fone: String(config.phone).replace(/\D/g, '') } : {}) },
          IE: String(config.state_registration).replace(/\D/g, ''),
          ...(config.cnae ? { CNAE: Number(String(config.cnae).replace(/\D/g, '')) } : {}), CRT: Number(config.tax_regime),
        },
        dest: {
          CNPJCPF: String(recipient.document).replace(/\D/g, ''),
          xNome: config.environment === 'homologacao' ? homologationName : str(recipient.name),
          enderDest: { xLgr: str(recipient.address), nro: str(recipient.address_number),
            ...(recipient.address_complement ? { xCpl: str(recipient.address_complement) } : {}), xBairro: str(recipient.neighborhood),
            cMun: Number(recipient.city_code), xMun: str(recipient.city), UF: str(recipient.state),
            CEP: String(recipient.cep).replace(/\D/g, ''), cPais: Number(recipient.country_code ?? 1058),
            xPais: str(recipient.country_name ?? 'Brasil'), ...(recipient.phone ? { fone: String(recipient.phone).replace(/\D/g, '') } : {}) },
          indIEDest: Number(recipient.ie_indicator), ...(Number(recipient.ie_indicator) === 1 && recipient.state_registration ? { IE: String(recipient.state_registration).replace(/\D/g, '') } : {}),
          ...(recipientEmail ? { email: recipientEmail } : {}),
        },
        det: details,
        total: { ICMSTot: {
          vBC: money(invoice.items.reduce((s: number, i: any) => s + Number(i.icms_base), 0)), vICMS: money(invoice.total_icms), vICMSDeson: '0.00',
          vFCP: '0.00', vBCST: '0.00', vST: '0.00', vFCPST: '0.00', vFCPSTRet: '0.00', vProd: money(invoice.total_products),
          vFrete: money(invoice.total_freight), vSeg: money(invoice.total_insurance), vDesc: money(invoice.total_discount), vII: '0.00', vIPI: '0.00',
          vIPIDevol: '0.00', vPIS: money(invoice.total_pis), vCOFINS: money(invoice.total_cofins), vOutro: money(invoice.total_other), vNF: money(invoice.total_nfe),
        }, IBSCBSTot: { vBCIBSCBS: money(invoice.items.reduce((s: number, i: any) => s + Number(i.ibs_base), 0)),
          gIBS: { gIBSUF: { vDif: 0, vDevTrib: 0, vIBSUF: money(invoice.items.reduce((s: number, i: any) => s + Number(i.ibs_base) * effectiveRate(i.ibs_state_rate, i.ibs_state_reduction) / 100, 0)) },
            gIBSMun: { vDif: 0, vDevTrib: 0, vIBSMun: money(invoice.items.reduce((s: number, i: any) => s + Number(i.ibs_base) * effectiveRate(i.ibs_city_rate, i.ibs_city_reduction) / 100, 0)) },
            vIBS: money(invoice.total_ibs), vCredPres: 0, vCredPresCondSus: 0 },
          gCBS: { vDif: 0, vDevTrib: 0, vCBS: money(invoice.total_cbs), vCredPres: 0, vCredPresCondSus: 0 },
        }, vNFTot: money(Number(invoice.total_nfe) + Number(invoice.total_ibs) + Number(invoice.total_cbs)) },
        transp: { modFrete: invoice.freight_mode },
        pag: { detPag: {
          indPag: String(invoice.payment_snapshot.method_code) === '15' ? 1 : 0,
          tPag: String(invoice.payment_snapshot.method_code),
          vPag: String(invoice.payment_snapshot.method_code) === '90' ? '0.00' : money(invoice.total_nfe),
        } },
        infAdic: { ...(invoice.fiscal_additional_info ? { infAdFisco: str(invoice.fiscal_additional_info) } : {}), ...(invoice.additional_info ? { infCpl: str(invoice.additional_info) } : {}) },
        infRespTec: {
          CNPJ: String(config.cnpj).replace(/\D/g, ''),
          xContato: 'Responsável Técnico',
          email: 'suporte@unalaticinios.com.br',
          fone: '81999999999',
        },
      } },
    } as NFe;
  }

  private findProtocol(value: any): any {
    if (!value || typeof value !== 'object') return undefined;
    if (value.infProt?.cStat) return value.infProt;
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = this.findProtocol(child);
      if (found) return found;
    }
    return undefined;
  }

  private isLocalXmlValidationError(message: string) {
    return /valida(?:ç|c)[aã]o do xml|schema validation|validation of (?:the )?xml/i.test(message);
  }

  private parseDuplicateRejection(message: string) {
    if (!/duplicidade de NF-e/i.test(message)) return undefined;
    const accessKey = message.match(/\[chNFe:\s*(\d{44})\]/i)?.[1];
    if (!accessKey) return undefined;
    return {
      accessKey,
      receiptNumber: message.match(/\[nRec:\s*(\d+)\]/i)?.[1],
    };
  }

  private async retryWithNextNumber(
    id: string,
    invoice: Record<string, any>,
    rejectionReason: string,
    duplicateRetry: number,
    user?: AuthenticatedUser,
  ): Promise<any> {
    await this.supabaseService.admin.from('nfe_invoices').update({
      status: 'REJEITADA',
      number: null,
      access_key: null,
      numeric_code: null,
      protocol_number: null,
      rejection_code: '539',
      rejection_reason: rejectionReason,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }).eq('id', id);

    if (duplicateRetry >= 4) {
      throw new BadRequestException(
        `A numeração da série ${invoice.series} está dessincronizada com a SEFAZ. `
        + 'Foram encontrados cinco números já utilizados; ajuste o próximo número antes de tentar novamente.',
      );
    }
    return this.authorize(id, user, duplicateRetry + 1);
  }

  private fiscalEmail(value: unknown) {
    return String(value ?? '')
      .split(/[,;\s]+/)
      .map((email) => email.trim())
      .find((email) => email.length <= 60 && /^[^@]+@[^@]+\.[^@]+$/.test(email));
  }

  private findValue(value: any, key: string): unknown {
    if (!value || typeof value !== 'object') return undefined;
    if (key in value) return value[key];
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = this.findValue(child, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private bestXml(files: Array<{ name: string; content: string }>, accessKey: string) {
    return files.find((file) => file.content.includes(accessKey) && file.content.includes('nfeProc'))?.content
      ?? files.find((file) => file.content.includes(accessKey))?.content
      ?? files[0]?.content;
  }

  private async upload(bucket: string, path: string, data: Buffer, contentType: string) {
    const { error } = await this.supabaseService.admin.storage.from(bucket).upload(path, data, { contentType, upsert: true });
    if (error) throw new BadRequestException(error.message);
    return path;
  }

  private async nextAttempt(id: string, operation: string) {
    const { count } = await this.supabaseService.admin.from('nfe_transmissions').select('id', { count: 'exact', head: true }).eq('nfe_invoice_id', id).eq('operation', operation);
    return Number(count ?? 0) + 1;
  }

  private async startTransmission(id: string, operation: string, attempt: number, payload: object, user?: AuthenticatedUser) {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const { data, error } = await this.supabaseService.admin.from('nfe_transmissions').insert({
      nfe_invoice_id: id, operation, attempt_number: attempt, idempotency_key: randomUUID(),
      xml_hash: hash, status: 'INICIADA', created_by: user?.id ?? null,
    }).select('id').single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Falha ao registrar transmissão.');
    return data.id;
  }

  private async finishTransmission(id: string, code: string, message: string, durationMs: number, response: any) {
    await this.supabaseService.admin.from('nfe_transmissions').update({
      status: code === '100' ? 'AUTORIZADA' : code === 'INDETERMINADO' ? 'INDETERMINADA' : 'CONCLUIDA',
      response_code: code, response_message: message, duration_ms: durationMs,
      response_metadata: { response },
    }).eq('id', id);
  }

  private nowWithOffset() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-03:00`;
  }

  private buildAccessKey(cnpj: string, issuedAt: string, series: number, number: number, numericCode: string) {
    const yearMonth = `${issuedAt.slice(2, 4)}${issuedAt.slice(5, 7)}`;
    const base = [
      '26', yearMonth, String(cnpj).replace(/\D/g, '').padStart(14, '0'), '55',
      String(series).padStart(3, '0'), String(number).padStart(9, '0'), '1', numericCode,
    ].join('');
    let weight = 2;
    let sum = 0;
    for (let index = base.length - 1; index >= 0; index -= 1) {
      sum += Number(base[index]) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const result = 11 - (sum % 11);
    const checkDigit = result === 10 || result === 11 ? 0 : result;
    return `${base}${checkDigit}`;
  }
}
