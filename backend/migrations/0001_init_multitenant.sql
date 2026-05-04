-- Phase 2: multi-tenant core schema (SQLite)
pragma foreign_keys = on;

create table if not exists tenants (
  id text primary key default (lower(hex(randomblob(16)))),
  slug text not null unique,
  legal_name text not null,
  display_name text not null,
  status text not null default 'active',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists tenant_branding (
  tenant_id text primary key references tenants(id) on delete cascade,
  logo_url text,
  app_name text not null default 'Gym Management',
  primary_color text not null default '#2563eb',
  secondary_color text not null default '#0f172a',
  accent_color text not null default '#10b981',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create table if not exists tenant_domains (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  host text not null unique,
  verified integer not null default 0,
  created_at text not null default current_timestamp
);

create table if not exists branches (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  phone text,
  email text,
  is_active integer not null default 1,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique (tenant_id, code)
);
create index if not exists idx_branches_tenant on branches(tenant_id);

create table if not exists roles (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  name text not null,
  is_system integer not null default 0,
  created_at text not null default current_timestamp,
  unique (tenant_id, name)
);

create table if not exists permissions (
  id text primary key default (lower(hex(randomblob(16)))),
  code text not null unique,
  description text not null
);

create table if not exists role_permissions (
  role_id text not null references roles(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists users (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  email text not null,
  username text not null,
  password_hash text not null,
  full_name text not null,
  photo_url text,
  status text not null default 'active',
  blocked_reason text,
  last_login_at text,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique (tenant_id, email),
  unique (tenant_id, username)
);

create table if not exists user_roles (
  user_id text not null references users(id) on delete cascade,
  role_id text not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table if not exists user_branches (
  user_id text not null references users(id) on delete cascade,
  branch_id text not null references branches(id) on delete cascade,
  primary key (user_id, branch_id)
);

create table if not exists invites (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  email text not null,
  role_id text not null references roles(id),
  branch_ids text not null default '[]',
  token_hash text not null unique,
  expires_at text not null,
  accepted_at text,
  invited_by text not null references users(id),
  created_at text not null default current_timestamp
);
create index if not exists idx_invites_tenant_email on invites(tenant_id, email);

create table if not exists tenant_settings (
  tenant_id text primary key references tenants(id) on delete cascade,
  data text not null default '{}',
  updated_by text references users(id),
  updated_at text not null default current_timestamp
);

create table if not exists leave_requests (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  branch_id text references branches(id),
  user_id text not null references users(id),
  leave_type text not null,
  start_date text not null,
  end_date text not null,
  days integer not null,
  reason text,
  status text not null default 'Pending',
  action_by text references users(id),
  action_at text,
  created_at text not null default current_timestamp
);
create index if not exists idx_leave_tenant_status on leave_requests(tenant_id, status);

create table if not exists audit_logs (
  id text primary key default (lower(hex(randomblob(16)))),
  tenant_id text not null references tenants(id) on delete cascade,
  actor_user_id text references users(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data text,
  after_data text,
  created_at text not null default current_timestamp
);
create index if not exists idx_audit_tenant_created on audit_logs(tenant_id, created_at desc);

-- Lightweight app-level JSON store used by current frontend sync.
create table if not exists app_kv (
  key text primary key,
  value_json text not null default '[]',
  updated_at text not null default current_timestamp
);
