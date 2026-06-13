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

class ReceivePurchaseItemDto {
  @IsString()
  purchaseItemId!: string;

  @IsNumber()
  @Min(0.0001)
  receivedQuantity!: number;

  @IsOptional()
  @IsString()
  supplierLotNumber?: string;

  @IsOptional()
  @IsDateString()
  manufactureDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class ReceivePurchaseDto {
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseItemDto)
  items!: ReceivePurchaseItemDto[];
}
