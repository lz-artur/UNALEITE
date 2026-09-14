import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInventorySessionDto {
  @ApiPropertyOptional({ description: 'Nome para identificar a contagem' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;
}
