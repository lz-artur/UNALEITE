import { IsOptional, IsString } from 'class-validator';

export class SettleFinancialEntryDto {
  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
