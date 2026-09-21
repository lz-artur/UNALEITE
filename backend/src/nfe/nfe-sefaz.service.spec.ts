import { NfeSefazService } from './nfe-sefaz.service';
import { generateFallbackDanfe } from './danfe-fallback';

describe('NfeSefazService', () => {
  it('remove ?wsdl do endereço usado para enviar o SOAP à SEFAZ-PE', () => {
    const service = new NfeSefazService({} as any);
    const wizard = {
      nfeWizardService: {
        utility: {
          getWebServiceUrl: () => 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4?wsdl',
        },
      },
    };

    (service as any).removeWsdlSuffixFromServiceUrls(wizard);

    expect(wizard.nfeWizardService.utility.getWebServiceUrl()).toBe(
      'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
    );
  });

  it('extrai o motivo do SOAP sem expor o XML completo', () => {
    const service = new NfeSefazService({} as any);
    expect((service as any).extractResponseMessage(
      '<soap:Fault><faultstring>Rejei&#xE7;&#xE3;o: Falha no esquema XML</faultstring></soap:Fault>',
    )).toBe('Rejeição: Falha no esquema XML');
  });

  it('gera um DANFE alternativo sem depender da biblioteca nativa', async () => {
    const key = '26260955219063000125550020000000401211010390';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
        <NFe><infNFe Id="NFe${key}"><ide><natOp>VENDA</natOp><serie>2</serie><nNF>40</nNF><dhEmi>2026-09-21T14:57:58-03:00</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb></ide>
        <emit><CNPJ>55219063000125</CNPJ><xNome>JPS UNAMILK LTDA</xNome><enderEmit><xLgr>SITIO</xLgr><nro>160</nro><xBairro>ZONA RURAL</xBairro><xMun>SAO BENTO DO UNA</xMun><UF>PE</UF><CEP>55370000</CEP></enderEmit><IE>117362832</IE></emit>
        <dest><CNPJ>21196210000177</CNPJ><xNome>CLIENTE TESTE</xNome><enderDest><xLgr>RUA TESTE</xLgr><nro>1</nro><xBairro>CENTRO</xBairro><xMun>CARUARU</xMun><UF>PE</UF><CEP>55000000</CEP></enderDest><IE>059609672</IE></dest>
        <det><prod><cProd>1861</cProd><xProd>QUEIJO TIPO MUSSARELA</xProd><NCM>04061010</NCM><CFOP>5101</CFOP><uCom>KG</uCom><qCom>10</qCom><vUnCom>26</vUnCom><vProd>260</vProd></prod><imposto><ICMS><ICMS00><CST>00</CST><vBC>260</vBC><pICMS>20.5</pICMS><vICMS>53.30</vICMS></ICMS00></ICMS></imposto></det>
        <total><ICMSTot><vBC>260</vBC><vICMS>53.30</vICMS><vProd>260</vProd><vNF>260</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag><detPag><tPag>15</tPag><vPag>260</vPag></detPag></pag></infNFe></NFe>
        <protNFe><infProt><chNFe>${key}</chNFe><nProt>126260000306667</nProt><dhRecbto>2026-09-21T15:00:00-03:00</dhRecbto><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
      </nfeProc>`;

    const pdf = await generateFallbackDanfe(xml, key);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3_000);
  });
});
