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

export class InstallmentEntryDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  dueDate!: string;
}

export class FulfillSalesOrderDto {
  @IsOptional()
  @IsDateString()
  fulfilledAt?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  installments?: number;

  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillSalesOrderItemDto)
  items!: FulfillSalesOrderItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentEntryDto)
  installmentEntries?: InstallmentEntryDto[];
}
