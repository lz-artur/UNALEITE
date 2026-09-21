import { Injectable } from '@nestjs/common';
import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Cancelamento, NFe } from '@nfewizard/types/nfe';
import { NfeConfigService } from './nfe-config.service';
import { generateFallbackDanfe } from './danfe-fallback';

@Injectable()
export class NfeSefazService {
  constructor(private readonly configService: NfeConfigService) {}

  async status() {
    return this.run(async (wizard) => wizard.NFE_ConsultaStatusServico());
  }

  async authorize(data: NFe, environment?: 'homologacao' | 'producao') {
    return this.run(async (wizard, workDir) => {
      const result = await wizard.NFE_Autorizacao(data);
      const xmlFiles = await this.readXmlFiles(workDir);
      return { result, xmlFiles };
    }, environment);
  }

  async query(accessKey: string, environment?: 'homologacao' | 'producao') {
    return this.run(async (wizard) => wizard.NFE_ConsultaProtocolo(accessKey), environment);
  }

  async cancel(data: Cancelamento, environment?: 'homologacao' | 'producao') {
    return this.run(async (wizard, workDir) => {
      const result = await wizard.NFE_Cancelamento(data);
      return { result, xmlFiles: await this.readXmlFiles(workDir) };
    }, environment);
  }

  async generateDanfe(data: any, accessKey: string) {
    const workDir = await mkdtemp(join(tmpdir(), 'una-danfe-'));
    const outputPath = join(workDir, `${accessKey}.pdf`);
    try {
      try {
        const { NFE_GerarDanfe } = await import('@nfewizard/danfe');
        const result = await NFE_GerarDanfe({ data, chave: accessKey, outputPath });
        if (!result.success) throw new Error(result.message);

        // A biblioteca não aguarda o flush do write stream para o disco.
        for (let i = 0; i < 20; i++) {
          try {
            const stat = await import('fs/promises').then(fs => fs.stat(outputPath));
            if (stat.size > 0) break;
          } catch {
            // File not created yet.
          }
          await new Promise(r => setTimeout(r, 100));
        }

        return await readFile(outputPath);
      } catch {
        return await generateFallbackDanfe(String(data ?? ''), accessKey);
      }
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async run<T>(
    operation: (wizard: any, workDir: string) => Promise<T>,
    environment?: 'homologacao' | 'producao',
  ) {
    const material = await this.configService.getCertificateMaterial();
    const effectiveEnvironment = environment ?? material.config.environment;
    const workDir = await mkdtemp(join(tmpdir(), 'una-nfe-'));
    try {
      await this.disableUnsafeLibraryLogs();
      const { default: NFeWizard } = await import('nfewizard-io');
      const wizard = new NFeWizard();
      await wizard.NFE_LoadEnvironment({ config: {
        dfe: {
          pathCertificado: material.buffer,
          senhaCertificado: material.password,
          UF: String(material.config.state),
          CPFCNPJ: String(material.config.cnpj).replace(/\D/g, ''),
          armazenarXMLAutorizacao: true,
          pathXMLAutorizacao: workDir,
          armazenarXMLRetorno: true,
          pathXMLRetorno: workDir,
        },
        nfe: {
          ambiente: effectiveEnvironment === 'producao' ? 1 : 2,
          versaoDF: '4.00',
        },
        lib: {
          connection: { timeout: 90_000 },
          log: { exibirLogNoConsole: false, armazenarLogs: false },
          useOpenSSL: false,
          useForSchemaValidation: 'validateSchemaJsBased',
        },
      } });
      this.removeWsdlSuffixFromServiceUrls(wizard);
      this.enrichHttpErrors(wizard);
      return await operation(wizard, workDir);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async disableUnsafeLibraryLogs() {
    const { logger } = await import('@nfewizard/shared');
    const safeLogger = logger as unknown as Record<string, (...args: unknown[]) => void>;
    for (const method of ['info', 'warn', 'error', 'debug', 'http']) {
      safeLogger[method] = () => undefined;
    }
  }

  private removeWsdlSuffixFromServiceUrls(wizard: any) {
    const utility = wizard?.nfeWizardService?.utility;
    if (!utility?.getWebServiceUrl) return;
    const original = utility.getWebServiceUrl.bind(utility);
    utility.getWebServiceUrl = (...args: unknown[]) => String(original(...args)).replace(/\?wsdl$/i, '');
  }

  private enrichHttpErrors(wizard: any) {
    const service = wizard?.nfeWizardService;
    const client = service ? Object.getOwnPropertyDescriptor(service, 'axios')?.value : undefined;
    if (!client) return;

    if (client.interceptors?.request) {
      client.interceptors.request.use((config: any) => {
        const headers = config.headers || {};
        if (headers['Content-Type'] && !('SOAPAction' in headers) && !('soapaction' in headers)) {
          const contentType = headers['Content-Type'];
          if (typeof contentType === 'string') {
            const match = contentType.match(/action="([^"]+)"/i);
            if (match) headers['SOAPAction'] = `"${match[1]}"`;
            else headers['SOAPAction'] = '""';
          }
        }
        return config;
      });
    }

    if (!client.interceptors?.response) return;
    client.interceptors.response.use(undefined, (error: any) => {
      const status = error?.response?.status;
      const details = this.extractResponseMessage(error?.response?.data);
      if (status) error.message = `HTTP ${status}${details ? `: ${details}` : ''}`;
      return Promise.reject(error);
    });
  }

  private extractResponseMessage(value: unknown) {
    const raw = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
    const tagged = raw.match(/<(?:xMotivo|faultstring|Text|Message)(?:\s[^>]*)?>([^<]+)</i)?.[1];
    return (tagged ?? raw.replace(/<[^>]+>/g, ' '))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  private async readXmlFiles(directory: string) {
    const files: Array<{ name: string; content: string }> = [];
    const walk = async (current: string) => {
      for (const entry of await readdir(current, { withFileTypes: true }).catch(() => [])) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (entry.name.toLowerCase().endsWith('.xml')) files.push({ name: entry.name, content: await readFile(path, 'utf8') });
      }
    };
    await walk(directory);
    return files;
  }
}
