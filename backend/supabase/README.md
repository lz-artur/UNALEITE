# Supabase Setup

Projeto configurado:

- `SUPABASE_URL`: `https://zzfvtugsgupcclfhprji.supabase.co`
- Frontend usa apenas a chave pública anon em `.env.local`
- Backend usa `service_role` e `SUPABASE_JWT_SECRET` em `backend/.env`

## Próximo passo obrigatório

Aplicar as migrações SQL nesta ordem no projeto Supabase:

1. `backend/supabase/migrations/001_extensions.sql`
2. `backend/supabase/migrations/002_schema.sql`
3. `backend/supabase/migrations/003_seed.sql`

Você pode fazer isso pelo SQL Editor do Supabase ou por CLI/conexão direta ao Postgres quando tiver acesso ao banco.

## Observações

- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- `SUPABASE_JWT_SECRET` fica apenas no backend para validação de tokens.
- O frontend ainda não tem fluxo de login Supabase implementado; a chave pública já ficou preparada para a próxima etapa.
