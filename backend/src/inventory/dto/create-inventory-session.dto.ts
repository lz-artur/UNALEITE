import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateInventorySessionDto {
  @ApiPropertyOptional({ description: 'Nome para identificar a contagem' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiProperty({ description: 'Início da janela em que a contagem poderá ser realizada' })
  @IsDateString()
  availableFrom!: string;

  @ApiProperty({ description: 'Fim da janela em que a contagem poderá ser realizada' })
  @IsDateString()
  availableUntil!: string;

  @ApiProperty({ description: 'Usuário operacional responsável pela contagem' })
  @IsUUID()
  assignedTo!: string;

  @ApiPropertyOptional({ description: 'Inclui lotes sem saldo no inventário' })
  @IsOptional()
  @IsBoolean()
  includeZeroBalanceLots?: boolean;
}
