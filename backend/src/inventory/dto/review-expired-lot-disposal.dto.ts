import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewExpiredLotDisposalDto {
  @IsIn(['aprovada', 'recusada'])
  decision!: 'aprovada' | 'recusada';

  @IsString()
  @IsOptional()
  reviewNote?: string;
}
