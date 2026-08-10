-- Menged Fleet Operations — initial schema
-- Run via Supabase CLI ("supabase db reset" / "supabase migration up") or plain psql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Fleet (vehicles)
-- ---------------------------------------------------------------------------
create table if not exists vehicles (
  id          uuid primary key default gen_random_uuid(),
  plate       text not null unique,
  side        text,
  type        text,
  route       text,
  driver      text,
  cashier     text,
  pos         text,
  status      text not null default 'Unassigned'
              check (status in ('Active', 'Idle', 'Unassigned')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Finance auditors (people who run the card audits)
-- ---------------------------------------------------------------------------
create table if not exists finance_auditors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  employee_id  text unique,
  phone        text,
  status       text not null default 'Active'
               check (status in ('Active', 'Inactive')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Finance audit — dynamic date/period columns + a row per cashier per
-- Activate/Corrupt entry, normalized instead of stored as a raw grid.
-- ---------------------------------------------------------------------------
create table if not exists finance_audit_periods (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,          -- e.g. 'March 31', 'April 1-30'
  sort_order  integer not null,
  created_at  timestamptz not null default now()
);

create table if not exists finance_audit_records (
  id          uuid primary key default gen_random_uuid(),
  seq_no      integer,                       -- "S/No" — only set on Activate rows
  cashier_name text not null,
  row_type    text not null check (row_type in ('Activate', 'Corrupt')),
  on_hand     numeric,
  total       numeric not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists finance_audit_entries (
  id         uuid primary key default gen_random_uuid(),
  record_id  uuid not null references finance_audit_records(id) on delete cascade,
  period_id  uuid not null references finance_audit_periods(id) on delete cascade,
  value      numeric not null default 0,
  unique (record_id, period_id)
);

-- ---------------------------------------------------------------------------
-- Material issues (equipment handed out to cashiers)
-- ---------------------------------------------------------------------------
create table if not exists material_issues (
  id          uuid primary key default gen_random_uuid(),
  cashier     text not null,
  material    text not null,
  quantity    numeric not null default 1,
  issue_date  date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vehicles_updated_at on vehicles;
create trigger trg_vehicles_updated_at
  before update on vehicles
  for each row execute function set_updated_at();

drop trigger if exists trg_auditors_updated_at on finance_auditors;
create trigger trg_auditors_updated_at
  before update on finance_auditors
  for each row execute function set_updated_at();

drop trigger if exists trg_finance_records_updated_at on finance_audit_records;
create trigger trg_finance_records_updated_at
  before update on finance_audit_records
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_vehicles_status on vehicles(status);
create index if not exists idx_finance_entries_record on finance_audit_entries(record_id);
create index if not exists idx_finance_entries_period on finance_audit_entries(period_id);
create index if not exists idx_finance_records_sort on finance_audit_records(sort_order);
create index if not exists idx_material_issues_cashier on material_issues(cashier);
