import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as forge from 'node-forge';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateNfeConfigDto } from './dto/nfe.dto';

const CONFIG_FIELDS: Record<string, string> = {
  legalName: 'legal_name', tradeName: 'trade_name', cnpj: 'cnpj',
  stateRegistration: 'state_registration', taxRegime: 'tax_regime', cnae: 'cnae',
  address: 'address', addressNumber: 'address_number', addressComplement: 'address_complement',
  neighborhood: 'neighborhood', cityCode: 'city_code', cityName: 'city_name',
  state: 'state', cep: 'cep', countryCode: 'country_code', countryName: 'country_name',
  phone: 'phone', environment: 'environment', series: 'series', initialNumber: 'initial_number',
  applicationVersion: 'application_version', defaultNatureOfOperation: 'default_nature_of_operation',
  defaultIcmsRate: 'default_icms_rate', defaultPisRate: 'default_pis_rate',
  defaultCofinsRate: 'default_cofins_rate', defaultAdditionalInfo: 'default_additional_info',
};

@Injectable()
export class NfeConfigService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async getRawConfig() {
    const { data, error } = await this.supabaseService.admin
      .from('nfe_configs').select('*').order('created_at').limit(1).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Configuração de NF-e não encontrada. Aplique as migrações.');
    return data as Record<string, any>;
  }

  async getConfig() {
    const raw = await this.getRawConfig();
    const { certificate_password_encrypted: _password, ...safe } = raw;
    return { ...safe, certificate_configured: Boolean(raw.certificate_path) };
  }

  async updateConfig(payload: UpdateNfeConfigDto, user?: AuthenticatedUser) {
    const current = await this.getRawConfig();
    if (payload.environment === 'producao' && current.environment !== 'producao') {
      await this.assertReadyForProduction(current, payload.productionActivation);
    }
    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
    for (const [key, column] of Object.entries(CONFIG_FIELDS)) {
      const value = payload[key as keyof UpdateNfeConfigDto];
      if (value !== undefined) update[column] = value;
    }
    const { error } = await this.supabaseService.admin.from('nfe_configs').update(update).eq('id', current.id);
    if (error) throw new BadRequestException(error.message);
    return this.getConfig();
  }

  private async assertReadyForProduction(config: Record<string, any>, confirmation?: string) {
    if (confirmation !== 'ATIVAR PRODUCAO') {
      throw new BadRequestException('Para ativar a produção, confirme digitando exatamente: ATIVAR PRODUCAO.');
    }

    const requiredFields: Array<[string, string]> = [
      ['legal_name', 'razão social'], ['cnpj', 'CNPJ'], ['state_registration', 'inscrição estadual'],
      ['tax_regime', 'regime tributário'], ['address', 'logradouro'], ['address_number', 'número'],
      ['neighborhood', 'bairro'], ['city_code', 'código IBGE'], ['city_name', 'município'],
      ['state', 'UF'], ['cep', 'CEP'], ['series', 'série'], ['initial_number', 'número inicial'],
    ];
    const missing = requiredFields
      .filter(([field]) => config[field] === undefined || config[field] === null || String(config[field]).trim() === '')
      .map(([, label]) => label);
    if (missing.length) throw new BadRequestException(`Complete a configuração de produção: ${missing.join(', ')}.`);
    if (!this.isValidCnpj(String(config.cnpj))) {
      throw new BadRequestException('O CNPJ do emitente é inválido; a produção não foi ativada.');
    }
    if (!config.certificate_path || !config.certificate_password_encrypted) {
      throw new BadRequestException('Configure o certificado A1 antes de ativar a produção.');
    }
    if (!config.certificate_expires_at || new Date(config.certificate_expires_at) <= new Date()) {
      throw new BadRequestException('O certificado A1 está vencido ou não tem validade registrada.');
    }

    // Also verifies that the encrypted password and the stored certificate still open together.
    await this.getCertificateMaterial();
  }

  private isValidCnpj(value: string) {
    const digits = value.replace(/\D/g, '');
    if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
    const digit = (length: number) => {
      let weight = length - 7;
      let sum = 0;
      for (let index = 0; index < length; index += 1) {
        sum += Number(digits[index]) * weight;
        weight = weight === 2 ? 9 : weight - 1;
      }
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return digit(12) === Number(digits[12]) && digit(13) === Number(digits[13]);
  }

  async uploadCertificate(file: { buffer: Buffer; originalname?: string }, password: string, user?: AuthenticatedUser) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecione um certificado A1 no formato PFX/P12.');
    let certificate: forge.pki.Certificate;
    try {
      const bytes = forge.util.createBuffer(file.buffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes), false, password);
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      certificate = bags[forge.pki.oids.certBag]?.[0]?.cert as forge.pki.Certificate;
      if (!certificate) throw new Error('Certificado não encontrado');
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      if (!keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.length) throw new Error('Chave privada não encontrada');
    } catch {
      throw new BadRequestException('Certificado inválido ou senha incorreta.');
    }

    const current = await this.getRawConfig();
    const cnpj = String(current.cnpj).replace(/\D/g, '');
    const path = `${cnpj}/certificate.pfx`;
    const { error: uploadError } = await this.supabaseService.admin.storage
      .from('fiscal-certificates')
      .upload(path, file.buffer, { contentType: 'application/x-pkcs12', upsert: true });
    if (uploadError) throw new BadRequestException(uploadError.message);

    const commonName = certificate.subject.getField('CN')?.value ?? 'Certificado A1';
    const fingerprint = createHash('sha256').update(file.buffer).digest('hex');
    const { error } = await this.supabaseService.admin.from('nfe_configs').update({
      certificate_path: path,
      certificate_password_encrypted: this.encrypt(password),
      certificate_subject: commonName,
      certificate_fingerprint: fingerprint,
      certificate_expires_at: certificate.validity.notAfter.toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    }).eq('id', current.id);
    if (error) throw new BadRequestException(error.message);
    return this.getConfig();
  }

  async getCertificateMaterial() {
    const config = await this.getRawConfig();
    if (!config.certificate_path || !config.certificate_password_encrypted) {
      throw new BadRequestException('Certificado digital ainda não foi configurado.');
    }
    const { data, error } = await this.supabaseService.admin.storage
      .from('fiscal-certificates').download(config.certificate_path);
    if (error || !data) throw new BadRequestException('Não foi possível carregar o certificado digital.');
    return { config, buffer: Buffer.from(await data.arrayBuffer()), password: this.decrypt(config.certificate_password_encrypted) };
  }

  private encryptionKey() {
    const secret = this.configService.get<string>('NFE_CERTIFICATE_ENCRYPTION_KEY')
      ?? this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException('Configure NFE_CERTIFICATE_ENCRYPTION_KEY com ao menos 32 caracteres.');
    }
    return createHash('sha256').update(secret).digest();
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
  }

  private decrypt(value: string) {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
