import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
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

export class CreateProductionOrderDto {
  @IsString()
  milkLotId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  @Min(0.01)
  litersToUse!: number;

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
}
