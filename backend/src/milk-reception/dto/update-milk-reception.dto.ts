import { PartialType } from '@nestjs/swagger';
import { CreateMilkReceptionDto } from './create-milk-reception.dto';

export class UpdateMilkReceptionDto extends PartialType(CreateMilkReceptionDto) {}
