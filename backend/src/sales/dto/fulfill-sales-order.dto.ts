import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class FulfillSalesOrderItemDto {
  @IsString()
  salesOrderItemId!: string;

  @IsString()
  finishedProductLotId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;
}

export class FulfillSalesOrderDto {
  @IsOptional()
  @IsDateString()
  fulfilledAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillSalesOrderItemDto)
  items!: FulfillSalesOrderItemDto[];
}
