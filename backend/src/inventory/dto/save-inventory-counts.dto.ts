import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class InventoryCountValueDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  countedQuantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SaveInventoryCountsDto {
  @ApiProperty({ type: [InventoryCountValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryCountValueDto)
  items!: InventoryCountValueDto[];
}
