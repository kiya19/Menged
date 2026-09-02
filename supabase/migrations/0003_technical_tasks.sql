-- Technical tasks for cashier material replacements and technician work orders
create table if not exists technical_tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null,
  title text not null,
  cashier text not null,
  vehicle text,
  material text not null,
  technician text not null,
  priority text not null default 'Normal' check (priority in ('Urgent', 'High', 'Normal', 'Low')),
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_status on technical_tasks(status);
create index if not exists idx_tasks_cashier on technical_tasks(cashier);
create index if not exists idx_tasks_technician on technical_tasks(technician);
