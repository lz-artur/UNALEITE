-- Remove espaços acidentais e padroniza as UFs já cadastradas.
-- A tela e a API passam a aceitar somente as siglas oficiais de duas letras.
update clients
set state = upper(trim(state))
where state is not null
  and state <> upper(trim(state));
