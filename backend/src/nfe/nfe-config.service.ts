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
      throw new BadRequestException('A mudança para produção deve ser liberada após os testes de homologação.');
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
