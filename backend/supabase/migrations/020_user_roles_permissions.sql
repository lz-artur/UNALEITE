-- =====================================================
-- 020: User Roles & Permissions (RBAC)
-- =====================================================

-- Perfil do usuário vinculado ao auth.users do Supabase
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'operacional' CHECK (role IN ('admin', 'operacional')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permissões granulares por tela/módulo para cada usuário
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_user_id, page_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON app_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_user_permissions_app_user_id ON user_permissions(app_user_id);

-- Seed: mark all existing Supabase auth users as admin
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, email FROM auth.users
  LOOP
    INSERT INTO app_users (auth_user_id, email, display_name, role, active)
    VALUES (r.id, r.email, split_part(r.email, '@', 1), 'admin', true)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;
END $$;
