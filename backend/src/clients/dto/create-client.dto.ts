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
  neighborhood?: string;

  @IsOptional()
  @IsString()
  cep?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
