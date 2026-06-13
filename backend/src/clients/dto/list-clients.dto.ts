import { IsOptional, IsString } from 'class-validator';

export class ListClientsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  activeOnly?: string;
}
