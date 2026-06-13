import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class ListQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  activeOnly?: string;
}
