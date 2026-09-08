import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  apiRequest: vi.fn(),
  withFallback: async <T>(loader: () => Promise<T>) => loader(),
}));

import { apiRequest } from './api';
import { loadCadastrosState, saveCadastroRecord } from './cadastrosApi';

const financializedMilkType = {
  id: '93f10a27-c138-4e7b-90a4-cfc6533008f7',
  name: 'Leite Cru Refrigerado',
  unit_id: '43dff697-65ef-4d8a-88e6-fde32cc81499',
  max_usage_hours: 500,
  ideal_reception_temperature: 4,
  max_reception_temperature: 12,
  accounting_category_id: '08b967bb-9ef3-45cc-9f67-369a96a73d22',
  accounting_subcategory_id: 'e3049321-22e7-4a51-a937-a24f32be91ea',
  cost_center_id: 'c4b3b9c0-908d-47ab-a7ae-28e40d10af3b',
  active: true,
};

describe('cadastrosApi milk types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores financial category fields when loading a milk type for editing', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path: string) =>
      path === '/cadastros/milkTypes' ? [financializedMilkType] : [],
    );

    const state = await loadCadastrosState();

    expect(state.milkTypes).toEqual([
      expect.objectContaining({
        accountingCategoryId: financializedMilkType.accounting_category_id,
        accountingSubcategoryId: financializedMilkType.accounting_subcategory_id,
        costCenterId: financializedMilkType.cost_center_id,
      }),
    ]);
  });

  it('keeps financial category fields after saving a milk type', async () => {
    vi.mocked(apiRequest).mockResolvedValue(financializedMilkType);

    const saved = await saveCadastroRecord('milkTypes', {
      id: financializedMilkType.id,
      name: financializedMilkType.name,
      unitId: financializedMilkType.unit_id,
      maxUsageHours: financializedMilkType.max_usage_hours,
      idealReceptionTemperature: financializedMilkType.ideal_reception_temperature,
      maxReceptionTemperature: financializedMilkType.max_reception_temperature,
      accountingCategoryId: financializedMilkType.accounting_category_id,
      accountingSubcategoryId: financializedMilkType.accounting_subcategory_id,
      costCenterId: financializedMilkType.cost_center_id,
      active: financializedMilkType.active,
    });

    expect(apiRequest).toHaveBeenCalledWith(
      `/cadastros/milkTypes/${financializedMilkType.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining(`\"accounting_category_id\":\"${financializedMilkType.accounting_category_id}\"`),
      }),
    );
    expect(saved).toEqual(expect.objectContaining({
      accountingCategoryId: financializedMilkType.accounting_category_id,
      accountingSubcategoryId: financializedMilkType.accounting_subcategory_id,
      costCenterId: financializedMilkType.cost_center_id,
    }));
  });
});
