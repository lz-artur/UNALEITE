import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManualExitDto {
  @ApiProperty({ description: 'ID of the finished product lot' })
  @IsUUID()
  @IsNotEmpty()
  finishedProductLotId!: string;

  @ApiProperty({ description: 'Quantity to exit from the lot' })
  @IsNumber()
  @Min(0.0001)
  @IsNotEmpty()
  quantity!: number;

  @ApiProperty({ description: 'Reason for the manual exit (e.g., Doação, Vencimento, etc.)' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'Additional notes regarding the exit' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Date and time of the exit in ISO format' })
  @IsString()
  @IsOptional()
  exitDate?: string;
}
