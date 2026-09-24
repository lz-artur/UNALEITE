import { IsString, MinLength } from 'class-validator';

export class CancelProductionOrderDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
