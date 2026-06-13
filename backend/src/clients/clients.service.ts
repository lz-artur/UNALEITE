import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listClients(filters: ListClientsDto = {}) {
    const { data, error } = await this.supabaseService.admin
      .from('clients')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).filter((client) => {
      if (filters.activeOnly === 'true' && !client.active) {
        return false;
      }

      if (filters.search) {
        const query = filters.search.toLowerCase();
        const haystack = [
          client.name,
          client.trade_name,
          client.document,
          client.code,
          client.city,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  async getClient(id: string) {
    const { data, error } = await this.supabaseService.admin
      .from('clients')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Client not found');
    }

    return data;
  }

  async createClient(payload: CreateClientDto, user?: AuthenticatedUser) {
    await this.ensureUniqueDocument(payload.document);

    const { data, error } = await this.supabaseService.admin
      .from('clients')
      .insert(this.normalizePayload(payload, user, true))
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async updateClient(id: string, payload: UpdateClientDto, user?: AuthenticatedUser) {
    await this.getClient(id);

    if (payload.document) {
      await this.ensureUniqueDocument(payload.document, id);
    }

    const { data, error } = await this.supabaseService.admin
      .from('clients')
      .update(this.normalizePayload(payload, user, false))
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async getActiveClient(id: string) {
    const client = await this.getClient(id);

    if (!client.active) {
      throw new BadRequestException('Client is inactive');
    }

    return client;
  }

  private normalizePayload(
    payload: Partial<CreateClientDto>,
    user: AuthenticatedUser | undefined,
    isCreate: boolean,
  ) {
    const normalizedDocument = payload.document
      ? this.normalizeDocument(payload.document)
      : undefined;

    return {
      ...(payload.code !== undefined ? { code: payload.code || null } : {}),
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.tradeName !== undefined ? { trade_name: payload.tradeName || null } : {}),
      ...(normalizedDocument !== undefined ? { document: normalizedDocument } : {}),
      ...(payload.stateRegistration !== undefined
        ? { state_registration: payload.stateRegistration || null }
        : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone || null } : {}),
      ...(payload.email !== undefined ? { email: payload.email || null } : {}),
      ...(payload.address !== undefined ? { address: payload.address || null } : {}),
      ...(payload.city !== undefined ? { city: payload.city || null } : {}),
      ...(payload.state !== undefined ? { state: payload.state || null } : {}),
      ...(payload.notes !== undefined ? { notes: payload.notes || null } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : isCreate ? { active: true } : {}),
      ...(isCreate ? { created_by: user?.id ?? null } : {}),
      updated_by: user?.id ?? null,
    };
  }

  private async ensureUniqueDocument(document: string, ignoreId?: string) {
    const normalizedDocument = this.normalizeDocument(document);
    const { data, error } = await this.supabaseService.admin
      .from('clients')
      .select('id')
      .eq('document', normalizedDocument);

    if (error) {
      throw new BadRequestException(error.message);
    }

    const conflict = (data ?? []).find((entry) => String(entry.id) !== ignoreId);
    if (conflict) {
      throw new BadRequestException('Client document already exists');
    }
  }

  private normalizeDocument(document: string) {
    return document.replace(/\D/g, '');
  }
}
