-- Users + roles for authentication.
-- Two roles: 'admin' (full access incl. deletes, bulk import, user + auditor
-- management) and 'staff' (day-to-day: view everything, assign fleet,
-- add finance records, add material issues — no deletes/admin actions).

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  role          text not null default 'staff' check (role in ('admin', 'staff')),
  status        text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create index if not exists idx_users_email on users(email);
