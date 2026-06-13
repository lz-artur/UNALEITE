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

export class CompleteProductionOrderDto {
  @IsNumber()
  @Min(0.0001)
  actualQuantityProduced!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplyConsumptionDto)
  supplyConsumptions?: SupplyConsumptionDto[];
}
