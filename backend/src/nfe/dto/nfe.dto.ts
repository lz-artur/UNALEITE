import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ListNfeDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class CreateNfeDraftDto {
  @IsUUID() salesOrderId!: string;
}

export class UpdateNfeDraftDto {
  @IsOptional() @IsString() natureOfOperation?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([0, 1]) operationType?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(4) purpose?: number;
  @IsOptional() @Type(() => Number) @IsInt() presenceIndicator?: number;
  @IsOptional() @IsBoolean() finalConsumer?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() freightMode?: number;
  @IsOptional() @IsObject() recipient?: Record<string, unknown>;
  @IsOptional() @IsObject() transport?: Record<string, unknown>;
  @IsOptional() @IsObject() payment?: Record<string, unknown>;
  @IsOptional() @IsString() additionalInfo?: string;
  @IsOptional() @IsString() fiscalAdditionalInfo?: string;
}

export class UpdateNfeItemDto {
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() fiscalName?: string;
  @IsOptional() @IsString() ncm?: string;
  @IsOptional() @IsString() cest?: string;
  @IsOptional() @IsString() cfop?: string;
  @IsOptional() @IsString() goodsOrigin?: string;
  @IsOptional() @IsString() commercialUnitSymbol?: string;
  @IsOptional() @IsString() taxUnitSymbol?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) freightValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) insuranceValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherValue?: number;
  @IsOptional() @IsString() icmsCst?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) icmsRate?: number;
  @IsOptional() @IsString() pisCst?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) pisRate?: number;
  @IsOptional() @IsString() cofinsCst?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cofinsRate?: number;
  @IsOptional() @IsString() ibsCbsCst?: string;
  @IsOptional() @IsString() ibsCbsClassification?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ibsStateRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) ibsStateReduction?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) ibsCityRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) ibsCityReduction?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cbsRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) cbsReduction?: number;
  @IsOptional() @IsString() additionalInfo?: string;
}

export class CancelNfeDto {
  @IsString() @MinLength(15) justification!: string;
}

export class UpdateNfeConfigDto {
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() tradeName?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() stateRegistration?: string;
  @IsOptional() @Type(() => Number) @IsInt() taxRegime?: number;
  @IsOptional() @IsString() cnae?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() addressNumber?: string;
  @IsOptional() @IsString() addressComplement?: string;
  @IsOptional() @IsString() neighborhood?: string;
  @IsOptional() @IsString() cityCode?: string;
  @IsOptional() @IsString() cityName?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() countryName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['homologacao', 'producao']) environment?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999) series?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) initialNumber?: number;
  @IsOptional() @IsString() applicationVersion?: string;
  @IsOptional() @IsString() defaultNatureOfOperation?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultIcmsRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultPisRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultCofinsRate?: number;
  @IsOptional() @IsString() defaultAdditionalInfo?: string;
}

export class CertificatePasswordDto {
  @IsString() @MinLength(1) password!: string;
}
