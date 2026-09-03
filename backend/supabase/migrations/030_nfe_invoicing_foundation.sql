-- =====================================================
-- 030: Faturamento NF-e 55 / SEFAZ-PE
-- =====================================================

alter table public.finished_products
  add column if not exists fiscal_code text,
  add column if not exists fiscal_name text,
  add column if not exists ncm text,
  add column if not exists cest text,
  add column if not exists goods_origin text,
  add column if not exists commercial_unit_symbol text,
  add column if not exists tax_unit_symbol text,
  add column if not exists internal_cfop text,
  add column if not exists interstate_cfop text,
  add column if not exists icms_cst text,
  add column if not exists pis_cst text,
  add column if not exists cofins_cst text,
  add column if not exists ibs_cbs_cst text,
  add column if not exists ibs_cbs_classification text,
  add column if not exists ibs_state_rate numeric(8,4),
  add column if not exists ibs_state_reduction numeric(8,4),
  add column if not exists ibs_city_rate numeric(8,4),
  add column if not exists ibs_city_reduction numeric(8,4),
  add column if not exists cbs_rate numeric(8,4),
  add column if not exists cbs_reduction numeric(8,4),
  add column if not exists fiscal_additional_info text;

alter table public.clients
  add column if not exists city_code text,
  add column if not exists country_code text default '1058',
  add column if not exists country_name text default 'Brasil',
  add column if not exists ie_indicator text,
  add column if not exists final_consumer boolean,
  add column if not exists address_complement text;

update public.clients
set state_registration = '059609672',
    ie_indicator = '1',
    final_consumer = false,
    address = 'SITIO LAGOA DO ALGODAO',
    address_number = '177',
    city = 'CARUARU',
    city_code = '2604106',
    state = 'PE',
    cep = '55000000',
    country_code = '1058',
    country_name = 'Brasil',
    updated_at = now()
where regexp_replace(document, '\D', '', 'g') = '21196210000177';

alter table public.user_permissions
  add column if not exists can_authorize boolean not null default false,
  add column if not exists can_cancel boolean not null default false,
  add column if not exists can_configure boolean not null default false;

create table if not exists public.nfe_configs (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null default 'JPS UNAMILK LTDA',
  trade_name text,
  cnpj text not null default '55219063000125',
  state_registration text not null default '117362832',
  tax_regime integer,
  cnae text,
  address text,
  address_number text,
  address_complement text,
  neighborhood text,
  city_code text,
  city_name text,
  state text not null default 'PE',
  cep text,
  country_code text not null default '1058',
  country_name text not null default 'Brasil',
  phone text,
  environment text not null default 'homologacao'
    check (environment in ('homologacao', 'producao')),
  model integer not null default 55 check (model = 55),
  series integer not null default 1 check (series between 0 and 999),
  initial_number integer not null default 1 check (initial_number > 0),
  application_version text not null default 'UNA-NFE-1.0',
  default_nature_of_operation text not null default 'Venda de produção do estabelecimento',
  default_icms_rate numeric(8,4) not null default 20.5,
  default_pis_rate numeric(8,4) not null default 1.65,
  default_cofins_rate numeric(8,4) not null default 7.6,
  default_additional_info text,
  certificate_path text,
  certificate_password_encrypted text,
  certificate_subject text,
  certificate_fingerprint text,
  certificate_expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index if not exists nfe_configs_cnpj_unique
  on public.nfe_configs(cnpj);

insert into public.nfe_configs (
  legal_name, trade_name, cnpj, state_registration, tax_regime,
  address, address_number, neighborhood, city_code, city_name, state, cep,
  environment, model, series, initial_number, default_nature_of_operation,
  default_icms_rate, default_pis_rate, default_cofins_rate
)
select
  'JPS UNAMILK LTDA', null, '55219063000125', '117362832', 3,
  'SITIO SERROTE DO GADO BRAVO', '160', 'ZONA RURAL', '2613008',
  'SÃO BENTO DO UNA', 'PE', '55370000', 'homologacao', 55, 2, 30,
  'VENDA DE PRODUCAO DO ESTABELECIMENTO', 20.5, 1.65, 7.6
where not exists (
  select 1 from public.nfe_configs where cnpj = '55219063000125'
);

update public.nfe_configs
set legal_name = 'JPS UNAMILK LTDA',
    trade_name = null,
    state_registration = '117362832',
    tax_regime = 3,
    address = 'SITIO SERROTE DO GADO BRAVO',
    address_number = '160',
    neighborhood = 'ZONA RURAL',
    city_code = '2613008',
    city_name = 'SÃO BENTO DO UNA',
    state = 'PE',
    cep = '55370000',
    environment = 'homologacao',
    model = 55,
    series = 2,
    initial_number = 30,
    default_nature_of_operation = 'VENDA DE PRODUCAO DO ESTABELECIMENTO',
    default_icms_rate = 20.5,
    default_pis_rate = 1.65,
    default_cofins_rate = 7.6,
    updated_at = now()
where cnpj = '55219063000125';

create table if not exists public.nfe_number_sequences (
  id uuid primary key default gen_random_uuid(),
  issuer_cnpj text not null,
  environment text not null check (environment in ('homologacao', 'producao')),
  model integer not null default 55 check (model = 55),
  series integer not null check (series between 0 and 999),
  next_number integer not null default 1 check (next_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issuer_cnpj, environment, model, series)
);

insert into public.nfe_number_sequences (
  issuer_cnpj, environment, model, series, next_number
)
values ('55219063000125', 'homologacao', 55, 2, 30)
on conflict (issuer_cnpj, environment, model, series)
do update set
  next_number = greatest(public.nfe_number_sequences.next_number, excluded.next_number),
  updated_at = now();

create table if not exists public.nfe_invoices (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id),
  environment text not null default 'homologacao'
    check (environment in ('homologacao', 'producao')),
  model integer not null default 55 check (model = 55),
  series integer not null default 1 check (series between 0 and 999),
  number integer,
  numeric_code text,
  access_key text,
  receipt_number text,
  protocol_number text,
  status text not null default 'RASCUNHO'
    check (status in (
      'RASCUNHO', 'VALIDADA', 'AUTORIZANDO', 'AUTORIZADA', 'REJEITADA',
      'PENDENTE_CONCILIACAO', 'CANCELANDO', 'CANCELADA'
    )),
  nature_of_operation text,
  operation_type integer not null default 1 check (operation_type in (0, 1)),
  purpose integer not null default 1,
  presence_indicator integer not null default 2,
  final_consumer boolean not null default false,
  freight_mode integer not null default 0,
  issued_at timestamptz,
  authorized_at timestamptz,
  canceled_at timestamptz,
  issuer_snapshot jsonb not null default '{}'::jsonb,
  recipient_snapshot jsonb not null default '{}'::jsonb,
  transport_snapshot jsonb not null default '{}'::jsonb,
  payment_snapshot jsonb not null default '{}'::jsonb,
  additional_info text,
  fiscal_additional_info text,
  total_products numeric(14,4) not null default 0,
  total_discount numeric(14,4) not null default 0,
  total_freight numeric(14,4) not null default 0,
  total_insurance numeric(14,4) not null default 0,
  total_other numeric(14,4) not null default 0,
  total_icms numeric(14,4) not null default 0,
  total_pis numeric(14,4) not null default 0,
  total_cofins numeric(14,4) not null default 0,
  total_ibs numeric(14,4) not null default 0,
  total_cbs numeric(14,4) not null default 0,
  total_nfe numeric(14,4) not null default 0,
  xml_sent_path text,
  xml_authorized_path text,
  danfe_path text,
  schema_version text,
  library_version text,
  rejection_code text,
  rejection_reason text,
  validation_issues jsonb not null default '[]'::jsonb,
  row_version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index if not exists nfe_invoices_access_key_unique
  on public.nfe_invoices(access_key)
  where access_key is not null;

create unique index if not exists nfe_invoices_number_unique
  on public.nfe_invoices(environment, model, series, number)
  where number is not null;

create index if not exists nfe_invoices_sales_order_idx
  on public.nfe_invoices(sales_order_id);

create index if not exists nfe_invoices_status_idx
  on public.nfe_invoices(status);

create index if not exists nfe_invoices_issued_at_idx
  on public.nfe_invoices(issued_at);

create table if not exists public.nfe_invoice_items (
  id uuid primary key default gen_random_uuid(),
  nfe_invoice_id uuid not null references public.nfe_invoices(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id),
  product_id uuid not null references public.finished_products(id),
  item_number integer not null,
  product_code text not null,
  product_name_snapshot text not null,
  fiscal_name_snapshot text,
  ncm text,
  cest text,
  cfop text,
  goods_origin text,
  commercial_unit_symbol text,
  tax_unit_symbol text,
  commercial_quantity numeric(14,4) not null,
  tax_quantity numeric(14,4) not null,
  unit_price numeric(14,10) not null,
  gross_value numeric(14,4) not null,
  discount_value numeric(14,4) not null default 0,
  freight_value numeric(14,4) not null default 0,
  insurance_value numeric(14,4) not null default 0,
  other_value numeric(14,4) not null default 0,
  total_value numeric(14,4) not null,
  icms_cst text,
  icms_base numeric(14,4) not null default 0,
  icms_rate numeric(8,4) not null default 0,
  icms_value numeric(14,4) not null default 0,
  pis_cst text,
  pis_base numeric(14,4) not null default 0,
  pis_rate numeric(8,4) not null default 0,
  pis_value numeric(14,4) not null default 0,
  cofins_cst text,
  cofins_base numeric(14,4) not null default 0,
  cofins_rate numeric(8,4) not null default 0,
  cofins_value numeric(14,4) not null default 0,
  ibs_cbs_cst text,
  ibs_cbs_classification text,
  ibs_base numeric(14,4) not null default 0,
  ibs_state_rate numeric(8,4) not null default 0,
  ibs_state_reduction numeric(8,4) not null default 0,
  ibs_city_rate numeric(8,4) not null default 0,
  ibs_city_reduction numeric(8,4) not null default 0,
  ibs_value numeric(14,4) not null default 0,
  cbs_base numeric(14,4) not null default 0,
  cbs_rate numeric(8,4) not null default 0,
  cbs_reduction numeric(8,4) not null default 0,
  cbs_value numeric(14,4) not null default 0,
  taxation_snapshot jsonb not null default '{}'::jsonb,
  additional_info text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nfe_invoice_id, item_number),
  unique (nfe_invoice_id, sales_order_item_id)
);

create index if not exists nfe_invoice_items_invoice_idx
  on public.nfe_invoice_items(nfe_invoice_id);

create table if not exists public.nfe_invoice_fulfillments (
  id uuid primary key default gen_random_uuid(),
  nfe_invoice_item_id uuid not null references public.nfe_invoice_items(id) on delete cascade,
  sales_order_fulfillment_id uuid not null references public.sales_order_fulfillments(id),
  finished_product_lot_id uuid not null references public.finished_product_lots(id),
  quantity numeric(14,4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (nfe_invoice_item_id, sales_order_fulfillment_id)
);

create table if not exists public.nfe_transmissions (
  id uuid primary key default gen_random_uuid(),
  nfe_invoice_id uuid not null references public.nfe_invoices(id) on delete cascade,
  operation text not null,
  attempt_number integer not null,
  idempotency_key text not null,
  xml_hash text,
  receipt_number text,
  response_code text,
  response_message text,
  status text not null,
  request_metadata jsonb not null default '{}'::jsonb,
  response_metadata jsonb not null default '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (nfe_invoice_id, operation, attempt_number),
  unique (idempotency_key)
);

create table if not exists public.nfe_events (
  id uuid primary key default gen_random_uuid(),
  nfe_invoice_id uuid not null references public.nfe_invoices(id) on delete cascade,
  event_type text not null,
  sequence integer not null default 1,
  status text not null,
  protocol_number text,
  response_code text,
  response_message text,
  justification text,
  xml_path text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (nfe_invoice_id, event_type, sequence)
);

alter table public.financial_entries
  add column if not exists nfe_invoice_id uuid references public.nfe_invoices(id);

create index if not exists financial_entries_nfe_invoice_idx
  on public.financial_entries(nfe_invoice_id);

insert into storage.buckets (id, name, public)
values
  ('fiscal-certificates', 'fiscal-certificates', false),
  ('nfe-xml', 'nfe-xml', false),
  ('nfe-danfe', 'nfe-danfe', false)
on conflict (id) do update set public = false;

create or replace function public.reserve_nfe_number(
  p_issuer_cnpj text,
  p_environment text,
  p_model integer,
  p_series integer,
  p_initial_number integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_number integer;
begin
  if p_environment not in ('homologacao', 'producao') then
    raise exception 'Ambiente de NF-e inválido.';
  end if;

  if p_model <> 55 then
    raise exception 'Apenas NF-e modelo 55 é suportada.';
  end if;

  insert into public.nfe_number_sequences (
    issuer_cnpj, environment, model, series, next_number
  ) values (
    regexp_replace(p_issuer_cnpj, '\D', '', 'g'),
    p_environment,
    p_model,
    p_series,
    greatest(coalesce(p_initial_number, 1), 1)
  )
  on conflict (issuer_cnpj, environment, model, series) do nothing;

  select next_number into v_next_number
  from public.nfe_number_sequences
  where issuer_cnpj = regexp_replace(p_issuer_cnpj, '\D', '', 'g')
    and environment = p_environment
    and model = p_model
    and series = p_series
  for update;

  update public.nfe_number_sequences
  set next_number = v_next_number + 1,
      updated_at = now()
  where issuer_cnpj = regexp_replace(p_issuer_cnpj, '\D', '', 'g')
    and environment = p_environment
    and model = p_model
    and series = p_series;

  return v_next_number;
end;
$$;

revoke execute on function public.reserve_nfe_number(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_nfe_number(text, text, integer, integer, integer)
  to service_role;
