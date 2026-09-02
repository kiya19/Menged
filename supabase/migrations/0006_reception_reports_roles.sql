-- Adds two new user roles on top of the existing 'admin' / 'staff':
--
--   'reception' — day-to-day access like staff, plus permission to edit
--                 and delete Issue Material records (staff can add/view
--                 only; admin and reception can also edit/delete).
--   'reports'   — restricted account that can only see the Reports,
--                 Tasks, and Finance Audit sections of the dashboard.
--
-- Widen the role check constraint to allow the two new values. The
-- constraint name below matches Postgres's default naming for the
-- inline `check` added in 0002_users_and_roles.sql
-- (table_column_check); drop-if-exists first so this migration is safe
-- to re-run.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'staff', 'reception', 'reports'));
