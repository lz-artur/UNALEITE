import { IsOptional, IsString } from 'class-validator';

export class ListMilkPayrollDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
