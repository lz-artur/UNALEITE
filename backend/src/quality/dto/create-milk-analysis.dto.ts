import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateMilkSubanalysisDto {
  @IsNumber()
  compartment_number!: number;

  @IsString()
  alizarol!: string;

  @IsNumber()
  @IsOptional()
  acidez?: number;

  @IsNumber()
  @IsOptional()
  crioscopia?: number;

  @IsNumber()
  @IsOptional()
  densidade?: number;

  @IsString()
  antibioticos!: string;

  @IsNumber()
  @IsOptional()
  gordura?: number;

  @IsNumber()
  @IsOptional()
  proteina?: number;

  @IsNumber()
  @IsOptional()
  temperatura?: number;

  @IsString()
  @IsOptional()
  alcool?: string;

  @IsNumber()
  @IsOptional()
  ph?: number;

  @IsNumber()
  @IsOptional()
  porcentagem_agua?: number;

  @IsNumber()
  @IsOptional()
  est?: number;

  @IsNumber()
  @IsOptional()
  esd?: number;

  @IsString()
  @IsOptional()
  redutase?: string;
}

export class CreateMilkAnalysisDto {
  @IsString()
  alizarol!: string;

  @IsNumber()
  @IsOptional()
  acidez?: number;

  @IsNumber()
  @IsOptional()
  crioscopia?: number;

  @IsNumber()
  @IsOptional()
  densidade?: number;

  @IsString()
  antibioticos!: string;

  @IsNumber()
  @IsOptional()
  gordura?: number;

  @IsNumber()
  @IsOptional()
  proteina?: number;

  @IsNumber()
  @IsOptional()
  temperatura?: number;

  @IsString()
  @IsOptional()
  observacoes?: string;

  @IsString()
  @IsOptional()
  alcool?: string;

  @IsNumber()
  @IsOptional()
  ph?: number;

  @IsNumber()
  @IsOptional()
  porcentagem_agua?: number;

  @IsNumber()
  @IsOptional()
  est?: number;

  @IsNumber()
  @IsOptional()
  esd?: number;

  @IsString()
  @IsOptional()
  redutase?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMilkSubanalysisDto)
  @IsOptional()
  subanalyses?: CreateMilkSubanalysisDto[];
}
