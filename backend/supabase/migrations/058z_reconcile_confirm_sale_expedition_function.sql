-- Reconcilia uma execução parcial anterior da migration 059.
-- A migration 059 renomeia confirm_sale_expedition para
-- confirm_sale_expedition_with_variance_v1. Em alguns ambientes esse nome
-- já foi criado anteriormente, sem registro no controle de migrations.
-- Só removemos essa cópia quando ela for comprovadamente idêntica à função
-- ativa e não tiver dependentes.
do $$
declare
  v_current oid := to_regprocedure('public.confirm_sale_expedition(uuid,uuid)');
  v_legacy oid := to_regprocedure('public.confirm_sale_expedition_with_variance_v1(uuid,uuid)');
  v_has_dependents boolean;
  v_is_identical boolean;
begin
  -- Ambiente limpo: a migration 059 poderá criar a versão histórica.
  if v_legacy is null then
    return;
  end if;

  if v_current is null then
    raise exception
      'Não é seguro reconciliar confirm_sale_expedition_with_variance_v1: a função ativa não existe';
  end if;

  select exists (
    select 1
      from pg_depend dependency
     where dependency.refobjid = v_legacy
       and dependency.deptype not in ('i', 'e')
  ) into v_has_dependents;

  if v_has_dependents then
    raise exception
      'Não é seguro reconciliar confirm_sale_expedition_with_variance_v1: há objetos dependentes';
  end if;

  select current_function.prosrc = legacy_function.prosrc
     and current_function.proargtypes = legacy_function.proargtypes
     and current_function.prorettype = legacy_function.prorettype
     and current_function.prosecdef = legacy_function.prosecdef
     and current_function.proconfig is not distinct from legacy_function.proconfig
     and current_function.proowner = legacy_function.proowner
     and current_function.proacl is not distinct from legacy_function.proacl
    into v_is_identical
    from pg_proc current_function
    join pg_proc legacy_function on legacy_function.oid = v_legacy
   where current_function.oid = v_current;

  if not coalesce(v_is_identical, false) then
    raise exception
      'Não é seguro reconciliar confirm_sale_expedition_with_variance_v1: a definição difere da função ativa';
  end if;

  drop function public.confirm_sale_expedition_with_variance_v1(uuid, uuid);
end;
$$;
