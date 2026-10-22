import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SupplyConsumptionDto {
  @IsOptional()
  @IsString()
  supplyLotId?: string;

  @IsOptional()
  @IsString()
  supplyItemId?: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

class FinishedProductConsumptionDto {
  @IsOptional()
  @IsString()
  finishedProductLotId?: string;

  @IsOptional()
  @IsString()
  finishedProductId?: string;

  @IsOptional()
  @IsIn(['Disponivel', 'Devolucao'])
  source?: 'Disponivel' | 'Devolucao';

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  pieces?: number;
}

class GeneratedCoProductDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class UpdateProductionOrderDto {
  @IsOptional()
  @IsString()
  milkLotId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  litersToUse?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  actualQuantityProduced?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commercialUnitsProduced?: number;

  @IsOptional()
  @IsString()
  commercialPresentation?: string;

  @IsOptional()
  @IsString()
  packageSize?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplyConsumptionDto)
  supplyConsumptions?: SupplyConsumptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinishedProductConsumptionDto)
  finishedProductConsumptions?: FinishedProductConsumptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneratedCoProductDto)
  generatedCoProducts?: GeneratedCoProductDto[];
}
