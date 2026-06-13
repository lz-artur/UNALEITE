import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ListMilkPayrollDto } from './dto/list-milk-payroll.dto';

@Injectable()
export class MilkPayrollService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listSummary(filters: ListMilkPayrollDto = {}) {
    const payload = await this.loadPayrollRows(filters);
    const grouped = new Map<
      string,
      {
        producerId: string;
        producerName: string;
        producerCode: string;
        lotsCount: number;
        totalVolumeLiters: number;
        totalValue: number;
        averagePricePerLiter: number;
      }
    >();

    for (const row of payload.rows) {
      const current = grouped.get(row.producerId) ?? {
        producerId: row.producerId,
        producerName: row.producerName,
        producerCode: row.producerCode,
        lotsCount: 0,
        totalVolumeLiters: 0,
        totalValue: 0,
        averagePricePerLiter: 0,
      };

      current.lotsCount += 1;
      current.totalVolumeLiters += row.volumeLiters;
      current.totalValue += row.totalValue;
      grouped.set(row.producerId, current);
    }

    const producers = Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        averagePricePerLiter:
          entry.totalVolumeLiters > 0 ? entry.totalValue / entry.totalVolumeLiters : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const totalValue = producers.reduce((sum, entry) => sum + entry.totalValue, 0);
    const totalVolumeLiters = producers.reduce((sum, entry) => sum + entry.totalVolumeLiters, 0);

    return {
      period: payload.period,
      totals: {
        producersCount: producers.length,
        lotsCount: payload.rows.length,
        totalValue,
        totalVolumeLiters,
        averagePricePerLiter: totalVolumeLiters > 0 ? totalValue / totalVolumeLiters : 0,
      },
      producers,
    };
  }

  async getProducerDetail(producerId: string, filters: ListMilkPayrollDto = {}) {
    const payload = await this.loadPayrollRows(filters);
    const producerRows = payload.rows.filter((row) => row.producerId === producerId);

    if (producerRows.length === 0) {
      const { data: producer, error } = await this.supabaseService.admin
        .from('producers')
        .select('id, code, name')
        .eq('id', producerId)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(error.message);
      }

      if (!producer) {
        throw new NotFoundException('Producer not found');
      }

      return {
        period: payload.period,
        producer: {
          id: producer.id,
          code: producer.code,
          name: producer.name,
        },
        totals: {
          lotsCount: 0,
          totalVolumeLiters: 0,
          totalValue: 0,
          averagePricePerLiter: 0,
        },
        lots: [],
      };
    }

    const producer = producerRows[0];
    const totalValue = producerRows.reduce((sum, row) => sum + row.totalValue, 0);
    const totalVolumeLiters = producerRows.reduce((sum, row) => sum + row.volumeLiters, 0);

    return {
      period: payload.period,
      producer: {
        id: producer.producerId,
        code: producer.producerCode,
        name: producer.producerName,
      },
      totals: {
        lotsCount: producerRows.length,
        totalVolumeLiters,
        totalValue,
        averagePricePerLiter: totalVolumeLiters > 0 ? totalValue / totalVolumeLiters : 0,
      },
      lots: producerRows.map((row) => ({
        lotId: row.lotId,
        lotCode: row.lotCode,
        receivedAt: row.receivedAt,
        status: row.status,
        volumeLiters: row.volumeLiters,
        finalPrice: row.finalPrice,
        totalValue: row.totalValue,
      })),
    };
  }

  private async loadPayrollRows(filters: ListMilkPayrollDto) {
    const [pricings, lots, producers] = await Promise.all([
      this.selectMany('milk_lot_pricing'),
      this.selectMany('milk_lots'),
      this.selectMany('producers'),
    ]);

    const lotMap = new Map(lots.map((lot) => [String(lot.id), lot]));
    const producerMap = new Map(producers.map((producer) => [String(producer.id), producer]));
    const filteredRows = (pricings ?? [])
      .map((pricing) => {
        const lot = lotMap.get(String(pricing.milk_lot_id));
        const producer = producerMap.get(String(pricing.producer_id));

        if (!lot || !producer) {
          return null;
        }

        return {
          lotId: String(lot.id),
          lotCode: String(lot.code),
          receivedAt: String(lot.received_at),
          status: String(lot.status),
          volumeLiters: Number(lot.volume_liters),
          totalValue: Number(pricing.total_value),
          finalPrice: Number(pricing.final_price),
          producerId: String(producer.id),
          producerCode: String(producer.code ?? ''),
          producerName: String(producer.name ?? ''),
        };
      })
      .filter((row): row is NonNullable<typeof row> => {
        if (!row) {
          return false;
        }

        if (filters.startDate && !this.isOnOrAfter(row.receivedAt, filters.startDate)) {
          return false;
        }

        if (filters.endDate && !this.isOnOrBefore(row.receivedAt, filters.endDate)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

    return {
      period: {
        startDate: filters.startDate ?? null,
        endDate: filters.endDate ?? null,
      },
      rows: filteredRows,
    };
  }

  private async selectMany(table: string) {
    const { data, error } = await this.supabaseService.admin.from(table).select('*');

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? [];
  }

  private isOnOrAfter(dateValue: string, filterValue: string) {
    return new Date(dateValue) >= new Date(filterValue);
  }

  private isOnOrBefore(dateValue: string, filterValue: string) {
    const filter = new Date(filterValue);
    filter.setHours(23, 59, 59, 999);
    return new Date(dateValue) <= filter;
  }
}
