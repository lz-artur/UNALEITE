import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  @IsOptional()
  @IsNumber()
  @Min(1)
  piecesQuantity?: number;
}

export class InstallmentEntryDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  dueDate!: string;
}

export class FulfillSalesOrderDto {
  @IsUUID()
  idempotencyKey!: string;

  @IsOptional()
  @IsDateString()
  fulfilledAt?: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsOptional()
  @IsNumber()
  installments?: number;

  @IsUUID()
  bankAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillSalesOrderItemDto)
  items!: FulfillSalesOrderItemDto[];

  @IsOptional()
  @IsBoolean()
  confirmedDivergentBalances?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallmentEntryDto)
  installmentEntries?: InstallmentEntryDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
