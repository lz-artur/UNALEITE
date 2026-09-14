import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateSaleExpeditionDto {
  @IsUUID()
  @IsNotEmpty()
  salesOrderId!: string;
}
