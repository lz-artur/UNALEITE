import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

// Parte dos dados de homologação usa UUIDs legados com versão 0 (por exemplo,
// 00000000-0000-0000-0000-000000002301). Eles são chaves válidas no banco,
// porém não passam no IsUUID do class-validator, que aceita só versões padrão.
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateExpeditionWeighingDto {
  @IsNotEmpty()
  @Matches(UUID_LIKE, { message: 'salesOrderItemId deve ser um identificador válido' })
  salesOrderItemId!: string;

  @IsNotEmpty()
  @Matches(UUID_LIKE, { message: 'finishedProductLotId deve ser um identificador válido' })
  finishedProductLotId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  piecesQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
