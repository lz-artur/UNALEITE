import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewExpeditionVarianceDto {
  @IsIn(['aceita', 'recusada'])
  decision!: 'aceita' | 'recusada';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
