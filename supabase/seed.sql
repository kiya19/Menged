-- Seed data mirroring the demo data currently hard-coded in the frontend's
-- localStorage "seed" array, so local dev looks identical to the demo.

-- Default login accounts — CHANGE THESE PASSWORDS before this goes anywhere
-- shared. Passwords below are bcrypt hashes of:
--   admin@menged.et  /  Admin@123   (role: admin)
--   staff@menged.et  /  Staff@123   (role: staff)
insert into users (name, email, password_hash, role) values
  ('Eyob A.',   'admin@menged.et', '$2b$10$4hsoU/AZGm3P7SKrsQ7JxuX4VY5hlUCPMdEnQ21LK9MMduWglqlge', 'admin'),
  ('Selam W.',  'staff@menged.et', '$2b$10$.5IggFxpdO6lXm0CWS7V4eXpR.IyVsxVEOegubRsoZ31GWpEzVRDK', 'staff')
on conflict (email) do nothing;

insert into vehicles (plate, side, type, route, driver, cashier, pos, status) values
  ('ET-3-84216', 'M-024', 'Minibus',  'Piassa — Megenagna',    'Samuel T.', '',          'POS-018', 'Unassigned'),
  ('ET-3-81604', 'M-011', 'Minibus',  'Mexico — Sar Bet',      'Mulu G.',   'Rahel M.',  'POS-012', 'Active'),
  ('ET-3-85472', 'M-031', 'City bus', '4 Kilo — Tor Hailoch',  'Kebede A.', 'Tigist D.', 'POS-023', 'Active'),
  ('ET-3-83190', 'M-019', 'Minibus',  'Bole — Piazza',         'Henok B.',  'Liya K.',   'POS-009', 'Idle'),
  ('ET-3-87581', 'M-044', 'City bus', 'Ayer Tena — Mexico',    'Mesfin N.', 'Sara W.',   'POS-031', 'Active'),
  ('ET-3-80211', 'M-008', 'Minibus',  'Kality — Merkato',      '',          'Marta F.',  'POS-004', 'Unassigned'),
  ('ET-3-86733', 'M-037', 'Minibus',  'Lebu — Bole',           'Yonas A.',  'Hana E.',   'POS-027', 'Active')
on conflict (plate) do nothing;

insert into finance_auditors (name, employee_id, phone, status) values
  ('Mekdes T.', 'FA-001', '+251 91 204 8801', 'Active')
on conflict (employee_id) do nothing;

insert into material_issues (cashier, material, quantity, issue_date, notes) values
  ('Rahel M.',  'Charger', 1, '2026-08-03', 'POS charging unit'),
  ('Tigist D.', 'Cable',   1, '2026-08-04', 'Replacement USB cable');

-- Finance audit: 5 period columns + 3 auditors, each with an Activate/Corrupt
-- row pair, matching the frontend's defaultFinanceAudit fixture.
insert into finance_audit_periods (label, sort_order) values
  ('March 31',     1),
  ('April 1-30',   2),
  ('May 1-31',     3),
  ('June 1-30',    4),
  ('July 1-22',    5);

do $$
declare
  p_mar uuid; p_apr uuid; p_may uuid; p_jun uuid; p_jul uuid;
  rec_id uuid;
begin
  select id into p_mar from finance_audit_periods where label = 'March 31';
  select id into p_apr from finance_audit_periods where label = 'April 1-30';
  select id into p_may from finance_audit_periods where label = 'May 1-31';
  select id into p_jun from finance_audit_periods where label = 'June 1-30';
  select id into p_jul from finance_audit_periods where label = 'July 1-22';

  -- 1. LENSA BOGALE
  insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order)
    values (1, 'LENSA BOGALE', 'Activate', 195, 1893, 1) returning id into rec_id;
  insert into finance_audit_entries (record_id, period_id, value) values
    (rec_id, p_mar, 17), (rec_id, p_apr, 421), (rec_id, p_may, 458), (rec_id, p_jun, 565), (rec_id, p_jul, 432);

  insert into finance_audit_records (cashier_name, row_type, total, sort_order)
    values ('LENSA BOGALE', 'Corrupt', 37, 2) returning id into rec_id;
  insert into finance_audit_entries (record_id, period_id, value) values
    (rec_id, p_mar, 1), (rec_id, p_apr, 7), (rec_id, p_may, 8), (rec_id, p_jun, 9), (rec_id, p_jul, 12);

  -- 2. Tsega Befikadu
  insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order)
    values (2, 'Tsega Befikadu', 'Activate', 143, 2062, 3) returning id into rec_id;
  insert into finance_audit_entries (record_id, period_id, value) values
    (rec_id, p_mar, 17), (rec_id, p_apr, 546), (rec_id, p_may, 428), (rec_id, p_jun, 634), (rec_id, p_jul, 437);

  insert into finance_audit_records (cashier_name, row_type, total, sort_order)
    values ('Tsega Befikadu', 'Corrupt', 33, 4) returning id into rec_id;
  insert into finance_audit_entries (record_id, period_id, value) values
    (rec_id, p_mar, 1), (rec_id, p_apr, 9), (rec_id, p_may, 4), (rec_id, p_jun, 13), (rec_id, p_jul, 6);

  -- 3. Melat Tewodros
  insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order)
    values (3, 'Melat Tewodros', 'Activate', 133, 2470, 5) returning id into rec_id;
  insert into finance_audit_entries (record_id, period_id, value) values
    (rec_id, p_mar, 3), (rec_id, p_apr, 601), (rec_id, p_may, 478), (rec_id, p_jun, 850), (rec_id, p_jul, 538);

  insert into finance_audit_records (cashier_name, row_type, total, sort_order)
    values ('Melat Tewodros', 'Corrupt', 32, 6) returning id into rec_id;
  insert into finance_audit_entries (record_id, period_id, value) values
    (rec_id, p_apr, 8), (rec_id, p_may, 9), (rec_id, p_jun, 9), (rec_id, p_jul, 6);
end $$;
