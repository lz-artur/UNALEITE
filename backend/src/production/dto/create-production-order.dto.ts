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
  @IsString()
  supplyLotId!: string;

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
}
