import { validate } from 'class-validator';
import { CreateExpeditionWeighingDto } from './create-expedition-weighing.dto';

describe('CreateExpeditionWeighingDto', () => {
  it('aceita identificadores legados usados nos lotes de homologação', async () => {
    const payload = Object.assign(new CreateExpeditionWeighingDto(), {
      salesOrderItemId: '32527ef9-60a9-4dd6-84e4-c4cf2737bf26',
      finishedProductLotId: '00000000-0000-0000-0000-000000002301',
      quantity: 2,
    });

    expect(await validate(payload)).toHaveLength(0);
  });

  it('rejeita identificadores malformados', async () => {
    const payload = Object.assign(new CreateExpeditionWeighingDto(), {
      salesOrderItemId: 'item-inválido',
      finishedProductLotId: 'lote-inválido',
      quantity: 2,
    });

    expect(await validate(payload)).toHaveLength(2);
  });
});
