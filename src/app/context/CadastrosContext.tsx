import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  type BlockReasonRecord,
  type CadastrosState,
  type FinishedProductRecord,
  initialCadastrosState,
  type MilkPriceRuleRecord,
  type MilkTypeRecord,
  type ProducerRecord,
  type ProductSpecRecord,
  type QualityParameterRecord,
  type RouteRecord,
  type StockLocationRecord,
  type SupplierRecord,
  type SupplyItemRecord,
  type SupplyLotRecord,
  type TransporterRecord,
  type UnitRecord,
} from '../data/cadastrosData';
import {
  loadCadastrosState,
  saveCadastroRecord,
  saveProductSpecRecord,
  saveRouteRecord,
  saveSupplierRecord,
  toggleCadastroRecord,
} from '../services/cadastrosApi';

type EntityWithActive = { id: string; active: boolean };

interface SaveRoutePayload {
  route: RouteRecord;
  producerIds: string[];
}

interface SaveSupplierPayload {
  supplier: SupplierRecord;
  suppliedItemIds: string[];
}

interface CadastrosContextValue extends CadastrosState {
  saveProducer: (record: ProducerRecord) => void;
  saveRoute: (payload: SaveRoutePayload) => void;
  saveTransporter: (record: TransporterRecord) => void;
  saveMilkType: (record: MilkTypeRecord) => void;
  saveQualityParameter: (record: QualityParameterRecord) => void;
  saveMilkPriceRule: (record: MilkPriceRuleRecord) => void;
  saveSupplier: (payload: SaveSupplierPayload) => void;
  saveSupplyItem: (record: SupplyItemRecord) => void;
  saveFinishedProduct: (record: FinishedProductRecord) => void;
  saveProductSpec: (record: ProductSpecRecord) => void;
  saveBlockReason: (record: BlockReasonRecord) => void;
  saveUnit: (record: UnitRecord) => void;
  saveStockLocation: (record: StockLocationRecord) => void;
  saveSupplyLot: (record: SupplyLotRecord) => void;
  toggleActive: (entity: EntityName, id: string) => void;
  getUnitSymbol: (id?: string) => string;
  getProducerById: (id?: string) => ProducerRecord | undefined;
  getRouteById: (id?: string) => RouteRecord | undefined;
  getTransporterById: (id?: string) => TransporterRecord | undefined;
  getSupplierById: (id?: string) => SupplierRecord | undefined;
  getSupplyItemById: (id?: string) => SupplyItemRecord | undefined;
  getFinishedProductById: (id?: string) => FinishedProductRecord | undefined;
  getStockLocationById: (id?: string) => StockLocationRecord | undefined;
  getBlockReasonById: (id?: string) => BlockReasonRecord | undefined;
  getProducerCountByRoute: (routeId: string) => number;
  getSuppliedItemsBySupplier: (supplierId: string) => SupplyItemRecord[];
}

type EntityName =
  | 'producers'
  | 'routes'
  | 'transporters'
  | 'milkTypes'
  | 'qualityParameters'
  | 'milkPriceRules'
  | 'suppliers'
  | 'supplyItems'
  | 'finishedProducts'
  | 'productSpecs'
  | 'blockReasons'
  | 'units'
  | 'stockLocations'
  | 'supplyLots';

const CadastrosContext = createContext<CadastrosContextValue | undefined>(undefined);

function upsertRecord<T extends { id: string }>(items: T[], record: T) {
  const existingIndex = items.findIndex((item) => item.id === record.id);
  if (existingIndex === -1) {
    return [...items, record];
  }

  return items.map((item) => (item.id === record.id ? record : item));
}

function toggleItems<T extends EntityWithActive>(items: T[], id: string) {
  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          active: !item.active,
        }
      : item,
  );
}

export function CadastrosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CadastrosState>(initialCadastrosState);

  useEffect(() => {
    let active = true;

    void loadCadastrosState()
      .then((remoteState) => {
        if (active) {
          setState(remoteState);
        }
      })
      .catch((error) => {
        console.error('Failed to load cadastros from backend', error);
      });

    return () => {
      active = false;
    };
  }, []);

  const saveProducer = (record: ProducerRecord) => {
    setState((current) => ({
      ...current,
      producers: upsertRecord(current.producers, record),
    }));

    void saveCadastroRecord('producers', record).catch((error) => {
      console.error('Failed to persist producer', error);
    });
  };

  const saveRoute = ({ route, producerIds }: SaveRoutePayload) => {
    setState((current) => {
      const nextRoutes = upsertRecord(current.routes, route);
      const nextProducers = current.producers.map((producer) => {
        if (producerIds.includes(producer.id)) {
          return {
            ...producer,
            routeId: route.id,
          };
        }

        if (producer.routeId === route.id) {
          return {
            ...producer,
            routeId: undefined,
          };
        }

        return producer;
      });

      return {
        ...current,
        routes: nextRoutes,
        producers: nextProducers,
      };
    });

    void saveRouteRecord(route, producerIds).catch((error) => {
      console.error('Failed to persist route', error);
    });
  };

  const saveTransporter = (record: TransporterRecord) => {
    setState((current) => ({
      ...current,
      transporters: upsertRecord(current.transporters, record),
    }));

    void saveCadastroRecord('transporters', record).catch((error) => {
      console.error('Failed to persist transporter', error);
    });
  };

  const saveMilkType = (record: MilkTypeRecord) => {
    setState((current) => ({
      ...current,
      milkTypes: upsertRecord(current.milkTypes, record),
    }));

    void saveCadastroRecord('milkTypes', record).catch((error) => {
      console.error('Failed to persist milk type', error);
    });
  };

  const saveQualityParameter = (record: QualityParameterRecord) => {
    setState((current) => ({
      ...current,
      qualityParameters: upsertRecord(current.qualityParameters, record),
    }));

    void saveCadastroRecord('qualityParameters', record).catch((error) => {
      console.error('Failed to persist quality parameter', error);
    });
  };

  const saveMilkPriceRule = (record: MilkPriceRuleRecord) => {
    setState((current) => ({
      ...current,
      milkPriceRules: upsertRecord(current.milkPriceRules, record),
    }));

    void saveCadastroRecord('milkPriceRules', record).catch((error) => {
      console.error('Failed to persist milk price rule', error);
    });
  };

  const saveSupplier = ({ supplier, suppliedItemIds }: SaveSupplierPayload) => {
    setState((current) => {
      const nextSuppliers = upsertRecord(current.suppliers, supplier);
      const nextItems = current.supplyItems.map((item) => {
        if (suppliedItemIds.includes(item.id)) {
          return {
            ...item,
            defaultSupplierId: supplier.id,
          };
        }

        if (item.defaultSupplierId === supplier.id) {
          return {
            ...item,
            defaultSupplierId: undefined,
          };
        }

        return item;
      });

      return {
        ...current,
        suppliers: nextSuppliers,
        supplyItems: nextItems,
      };
    });

    void saveSupplierRecord(supplier, suppliedItemIds).catch((error) => {
      console.error('Failed to persist supplier', error);
    });
  };

  const saveSupplyItem = (record: SupplyItemRecord) => {
    setState((current) => ({
      ...current,
      supplyItems: upsertRecord(current.supplyItems, record),
    }));

    void saveCadastroRecord('supplyItems', record).catch((error) => {
      console.error('Failed to persist supply item', error);
    });
  };

  const saveFinishedProduct = (record: FinishedProductRecord) => {
    setState((current) => ({
      ...current,
      finishedProducts: upsertRecord(current.finishedProducts, record),
    }));

    void saveCadastroRecord('finishedProducts', record).catch((error) => {
      console.error('Failed to persist finished product', error);
    });
  };

  const saveProductSpec = (record: ProductSpecRecord) => {
    setState((current) => ({
      ...current,
      productSpecs: upsertRecord(current.productSpecs, record),
    }));

    void saveProductSpecRecord(record).catch((error) => {
      console.error('Failed to persist product spec', error);
    });
  };

  const saveBlockReason = (record: BlockReasonRecord) => {
    setState((current) => ({
      ...current,
      blockReasons: upsertRecord(current.blockReasons, record),
    }));

    void saveCadastroRecord('blockReasons', record).catch((error) => {
      console.error('Failed to persist block reason', error);
    });
  };

  const saveUnit = (record: UnitRecord) => {
    setState((current) => ({
      ...current,
      units: upsertRecord(current.units, record),
    }));

    void saveCadastroRecord('units', record).catch((error) => {
      console.error('Failed to persist unit', error);
    });
  };

  const saveStockLocation = (record: StockLocationRecord) => {
    setState((current) => ({
      ...current,
      stockLocations: upsertRecord(current.stockLocations, record),
    }));

    void saveCadastroRecord('stockLocations', record).catch((error) => {
      console.error('Failed to persist stock location', error);
    });
  };

  const saveSupplyLot = (record: SupplyLotRecord) => {
    setState((current) => ({
      ...current,
      supplyLots: upsertRecord(current.supplyLots, record),
    }));

    void saveCadastroRecord('supplyLots', record).catch((error) => {
      console.error('Failed to persist supply lot', error);
    });
  };

  const toggleActive = (entity: EntityName, id: string) => {
    setState((current) => {
      switch (entity) {
        case 'producers':
          return { ...current, producers: toggleItems(current.producers, id) };
        case 'routes':
          return { ...current, routes: toggleItems(current.routes, id) };
        case 'transporters':
          return { ...current, transporters: toggleItems(current.transporters, id) };
        case 'milkTypes':
          return { ...current, milkTypes: toggleItems(current.milkTypes, id) };
        case 'qualityParameters':
          return { ...current, qualityParameters: toggleItems(current.qualityParameters, id) };
        case 'milkPriceRules':
          return { ...current, milkPriceRules: toggleItems(current.milkPriceRules, id) };
        case 'suppliers':
          return { ...current, suppliers: toggleItems(current.suppliers, id) };
        case 'supplyItems':
          return { ...current, supplyItems: toggleItems(current.supplyItems, id) };
        case 'finishedProducts':
          return { ...current, finishedProducts: toggleItems(current.finishedProducts, id) };
        case 'productSpecs':
          return { ...current, productSpecs: toggleItems(current.productSpecs, id) };
        case 'blockReasons':
          return { ...current, blockReasons: toggleItems(current.blockReasons, id) };
        case 'units':
          return { ...current, units: toggleItems(current.units, id) };
        case 'stockLocations':
          return { ...current, stockLocations: toggleItems(current.stockLocations, id) };
        case 'supplyLots':
          return { ...current, supplyLots: toggleItems(current.supplyLots, id) };
        default:
          return current;
      }
    });

    void toggleCadastroRecord(entity, id).catch((error) => {
      console.error(`Failed to toggle entity ${entity}`, error);
    });
  };

  const value = useMemo<CadastrosContextValue>(
    () => ({
      ...state,
      saveProducer,
      saveRoute,
      saveTransporter,
      saveMilkType,
      saveQualityParameter,
      saveMilkPriceRule,
      saveSupplier,
      saveSupplyItem,
      saveFinishedProduct,
      saveProductSpec,
      saveBlockReason,
      saveUnit,
      saveStockLocation,
      saveSupplyLot,
      toggleActive,
      getUnitSymbol: (id) => state.units.find((item) => item.id === id)?.symbol || '-',
      getProducerById: (id) => state.producers.find((item) => item.id === id),
      getRouteById: (id) => state.routes.find((item) => item.id === id),
      getTransporterById: (id) => state.transporters.find((item) => item.id === id),
      getSupplierById: (id) => state.suppliers.find((item) => item.id === id),
      getSupplyItemById: (id) => state.supplyItems.find((item) => item.id === id),
      getFinishedProductById: (id) => state.finishedProducts.find((item) => item.id === id),
      getStockLocationById: (id) => state.stockLocations.find((item) => item.id === id),
      getBlockReasonById: (id) => state.blockReasons.find((item) => item.id === id),
      getProducerCountByRoute: (routeId) => state.producers.filter((item) => item.routeId === routeId).length,
      getSuppliedItemsBySupplier: (supplierId) =>
        state.supplyItems.filter((item) => item.defaultSupplierId === supplierId),
    }),
    [state],
  );

  return <CadastrosContext.Provider value={value}>{children}</CadastrosContext.Provider>;
}

export function useCadastros() {
  const context = useContext(CadastrosContext);

  if (!context) {
    throw new Error('useCadastros must be used inside CadastrosProvider');
  }

  return context;
}
