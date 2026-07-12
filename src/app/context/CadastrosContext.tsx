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

  const handleSaveResult = <K extends keyof CadastrosState, T extends { id: string }>(
    entityKey: K,
    tempId: string,
    promise: Promise<T>,
  ) => {
    promise
      .then((savedRecord) => {
        setState((current) => ({
          ...current,
          [entityKey]: (current[entityKey] as T[]).map((item) =>
            item.id === tempId ? savedRecord : item,
          ),
        }));
      })
      .catch((error) => {
        console.error(`Failed to persist ${entityKey}`, error);
      });
  };

  const saveProducer = (record: ProducerRecord) => {
    setState((current) => ({
      ...current,
      producers: upsertRecord(current.producers, record),
    }));

    handleSaveResult('producers', record.id, saveCadastroRecord('producers', record) as Promise<ProducerRecord>);
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

    saveRouteRecord(route, producerIds)
      .then((savedRoute) => {
        setState((current) => ({
          ...current,
          routes: current.routes.map((r) => (r.id === route.id ? savedRoute : r)),
          producers: current.producers.map((producer) =>
            producer.routeId === route.id ? { ...producer, routeId: savedRoute.id } : producer,
          ),
        }));
      })
      .catch((error) => {
        console.error('Failed to persist route', error);
      });
  };

  const saveTransporter = (record: TransporterRecord) => {
    setState((current) => ({
      ...current,
      transporters: upsertRecord(current.transporters, record),
    }));

    handleSaveResult('transporters', record.id, saveCadastroRecord('transporters', record) as Promise<TransporterRecord>);
  };

  const saveMilkType = (record: MilkTypeRecord) => {
    setState((current) => ({
      ...current,
      milkTypes: upsertRecord(current.milkTypes, record),
    }));

    handleSaveResult('milkTypes', record.id, saveCadastroRecord('milkTypes', record) as Promise<MilkTypeRecord>);
  };

  const saveQualityParameter = (record: QualityParameterRecord) => {
    setState((current) => ({
      ...current,
      qualityParameters: upsertRecord(current.qualityParameters, record),
    }));

    handleSaveResult('qualityParameters', record.id, saveCadastroRecord('qualityParameters', record) as Promise<QualityParameterRecord>);
  };

  const saveMilkPriceRule = (record: MilkPriceRuleRecord) => {
    setState((current) => ({
      ...current,
      milkPriceRules: upsertRecord(current.milkPriceRules, record),
    }));

    handleSaveResult('milkPriceRules', record.id, saveCadastroRecord('milkPriceRules', record) as Promise<MilkPriceRuleRecord>);
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

    saveSupplierRecord(supplier, suppliedItemIds)
      .then((savedSupplier) => {
        setState((current) => ({
          ...current,
          suppliers: current.suppliers.map((s) => (s.id === supplier.id ? savedSupplier : s)),
          supplyItems: current.supplyItems.map((item) =>
            item.defaultSupplierId === supplier.id ? { ...item, defaultSupplierId: savedSupplier.id } : item,
          ),
        }));
      })
      .catch((error) => {
        console.error('Failed to persist supplier', error);
      });
  };

  const saveSupplyItem = (record: SupplyItemRecord) => {
    setState((current) => ({
      ...current,
      supplyItems: upsertRecord(current.supplyItems, record),
    }));

    handleSaveResult('supplyItems', record.id, saveCadastroRecord('supplyItems', record) as Promise<SupplyItemRecord>);
  };

  const saveFinishedProduct = (record: FinishedProductRecord) => {
    setState((current) => ({
      ...current,
      finishedProducts: upsertRecord(current.finishedProducts, record),
    }));

    handleSaveResult('finishedProducts', record.id, saveCadastroRecord('finishedProducts', record) as Promise<FinishedProductRecord>);
  };

  const saveProductSpec = (record: ProductSpecRecord) => {
    setState((current) => ({
      ...current,
      productSpecs: upsertRecord(current.productSpecs, record),
    }));

    handleSaveResult('productSpecs', record.id, saveProductSpecRecord(record));
  };

  const saveBlockReason = (record: BlockReasonRecord) => {
    setState((current) => ({
      ...current,
      blockReasons: upsertRecord(current.blockReasons, record),
    }));

    handleSaveResult('blockReasons', record.id, saveCadastroRecord('blockReasons', record) as Promise<BlockReasonRecord>);
  };

  const saveUnit = (record: UnitRecord) => {
    setState((current) => ({
      ...current,
      units: upsertRecord(current.units, record),
    }));

    handleSaveResult('units', record.id, saveCadastroRecord('units', record) as Promise<UnitRecord>);
  };

  const saveStockLocation = (record: StockLocationRecord) => {
    setState((current) => ({
      ...current,
      stockLocations: upsertRecord(current.stockLocations, record),
    }));

    handleSaveResult('stockLocations', record.id, saveCadastroRecord('stockLocations', record) as Promise<StockLocationRecord>);
  };

  const saveSupplyLot = (record: SupplyLotRecord) => {
    setState((current) => ({
      ...current,
      supplyLots: upsertRecord(current.supplyLots, record),
    }));

    handleSaveResult('supplyLots', record.id, saveCadastroRecord('supplyLots', record) as Promise<SupplyLotRecord>);
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
