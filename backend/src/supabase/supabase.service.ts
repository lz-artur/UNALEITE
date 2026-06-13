import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceRoleKey) {
      throw new InternalServerErrorException(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
      );
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });
  }

  get admin() {
    return this.client;
  }
}
