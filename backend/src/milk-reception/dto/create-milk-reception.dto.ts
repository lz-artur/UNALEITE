import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMilkReceptionDto {
  @IsString()
  producerId!: string;

  @IsString()
  routeId!: string;

  @IsString()
  transporterId!: string;

  @IsOptional()
  @IsString()
  milkTypeId?: string;

  @IsNumber()
  @Min(0.01)
  volumeLiters!: number;

  @IsNumber()
  temperatura!: number;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  carPlate?: string;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  analystName?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
