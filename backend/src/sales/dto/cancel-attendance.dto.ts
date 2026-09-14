import { IsOptional, IsString } from 'class-validator';

export class CancelAttendanceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
