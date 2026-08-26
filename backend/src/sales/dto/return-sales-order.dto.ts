import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ReturnSalesOrderItemDto {
  @IsString()
  productId!: string;

  @IsString()
  lotId!: string;

  @IsNumber()
  returnedQuantity!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class ReturnSalesOrderDto {
  @IsString()
  returnDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnSalesOrderItemDto)
  items!: ReturnSalesOrderItemDto[];

  @IsNumber()
  discountAmount!: number;
}
