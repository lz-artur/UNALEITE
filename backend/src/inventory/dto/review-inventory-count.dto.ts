import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewInventoryCountDto {
  @ApiPropertyOptional({ description: 'Justificativa do administrador' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
