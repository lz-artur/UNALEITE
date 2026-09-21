import { NfeService } from './nfe.service';

describe('NfeService environment isolation', () => {
  it('reaproveita somente uma nota existente no mesmo ambiente da configuração', async () => {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      neq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'production-invoice', status: 'RASCUNHO' } }),
    };
    const supabase = { admin: { from: jest.fn(() => query) } } as any;
    const config = { getRawConfig: jest.fn().mockResolvedValue({ environment: 'producao' }) } as any;
    const service = new NfeService(supabase, config, {} as any);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'production-invoice' } as any);

    const result = await service.createDraft({ salesOrderId: 'order-1' });

    expect(query.eq).toHaveBeenCalledWith('sales_order_id', 'order-1');
    expect(query.eq).toHaveBeenCalledWith('environment', 'producao');
    expect(result).toEqual({ id: 'production-invoice' });
  });
});
