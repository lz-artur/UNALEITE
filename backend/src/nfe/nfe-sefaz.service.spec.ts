import { NfeSefazService } from './nfe-sefaz.service';

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
});
