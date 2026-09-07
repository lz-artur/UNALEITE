import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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

  @IsNumber()
  @Min(0.0001)
  quantity!: number;
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
  @Min(0.01)
  litersToUse?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  actualQuantityProduced?: number;

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
