import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

class WarehouseWithdrawalItemDto {
  @IsUUID() supplyItemId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
}

export class CreateWarehouseWithdrawalDto {
  @IsString() @IsNotEmpty() sector!: string;
  @IsString() @IsOptional() notes?: string;
  @IsDateString() @IsOptional() withdrawalDate?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => WarehouseWithdrawalItemDto)
  items!: WarehouseWithdrawalItemDto[];
}
