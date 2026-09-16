import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class SettleFinancialEntryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
