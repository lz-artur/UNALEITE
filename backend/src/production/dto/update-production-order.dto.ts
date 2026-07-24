import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductionOrderDto {
  @IsOptional()
  @IsString()
  milkLotId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  litersToUse?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  actualQuantityProduced?: number;
}
