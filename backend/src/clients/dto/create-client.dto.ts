import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsString()
  document!: string;

  @IsOptional()
  @IsString()
  stateRegistration?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  addressNumber?: string;

  @IsOptional()
  @IsString()
  addressComplement?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  cep?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  cityCode?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  countryName?: string;

  @IsOptional()
  @IsString()
  ieIndicator?: string;

  @IsOptional()
  @IsBoolean()
  finalConsumer?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  delinquent?: boolean;
}
