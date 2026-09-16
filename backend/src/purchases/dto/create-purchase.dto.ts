import {
  ArrayMinSize,
  IsArray,
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

class PurchaseInstallmentDto {
  @IsDateString()
  dueDate!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

class CreatePurchaseItemDto {
  @IsString()
  supplyItemId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseDto {
  @IsString()
  supplierId!: string;

  @IsDateString()
  purchaseDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];

  @IsNotEmpty()
  @IsUUID()
  paymentMethodId!: string;

  @IsNotEmpty()
  @IsUUID()
  paymentTypeId!: string;

  @IsNotEmpty()
  @IsUUID()
  bankAccountId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInstallmentDto)
  installments?: PurchaseInstallmentDto[];
}
