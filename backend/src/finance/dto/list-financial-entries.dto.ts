import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListFinancialEntriesDto {
  @IsOptional()
  @IsString()
  @IsIn(['Pagar', 'Receber'])
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Aberto', 'Pago', 'Vencido', 'Cancelado'])
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  producerId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
