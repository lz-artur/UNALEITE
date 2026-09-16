import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateExpiredLotDisposalDto {
  @IsIn(['Insumo', 'Produto Acabado'])
  lotType!: 'Insumo' | 'Produto Acabado';

  @IsUUID()
  lotId!: string;

  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @IsIn(['repasse_custo', 'doacao_dre'])
  destination!: 'repasse_custo' | 'doacao_dre';

  @IsString()
  @IsNotEmpty()
  justification!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
