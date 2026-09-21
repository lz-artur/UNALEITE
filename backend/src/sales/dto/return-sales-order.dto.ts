import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnSalesOrderItemDto {
  @IsString()
  salesOrderItemId!: string;

  @IsString()
  lotId!: string;

  @IsNumber()
  @Min(0.0001)
  returnedQuantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  returnedPieces?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class ReturnSalesOrderDto {
  @IsDateString()
  returnDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnSalesOrderItemDto)
  items!: ReturnSalesOrderItemDto[];

  @IsNumber()
  @Min(0)
  discountAmount!: number;

  @IsOptional()
  @IsIn(['credit', 'refund'])
  excessHandlingStrategy?: 'credit' | 'refund';
}
