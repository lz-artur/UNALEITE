import {
  IsArray,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AdjustmentItemDto {
  @IsString()
  finishedProductLotId!: string;

  @IsNumber()
  @Min(0)
  newQuantity!: number;
}

export class AdjustProductionOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentItemDto)
  adjustments!: AdjustmentItemDto[];

  @IsString()
  reason!: string;

  @IsString()
  notes!: string;
}
