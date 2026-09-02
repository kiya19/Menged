const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function shouldUseSsl() {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;
  const url = process.env.DATABASE_URL || '';
  return /supabase\.co|render\.com|amazonaws\.com/.test(url);
}

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] Unexpected error on idle client', err);
  });
} else {
  // eslint-disable-next-line no-console
  console.log('[db] No DATABASE_URL provided — initializing in-memory PostgreSQL engine...');
  const { newDb, DataType } = require('pg-mem');
  const db = newDb();

  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.text,
    impure: true,
    implementation: () => crypto.randomUUID(),
  });

  const migrationsDir = path.join(__dirname, '../../supabase/migrations');
  const schema1 = fs.readFileSync(path.join(migrationsDir, '0001_init_schema.sql'), 'utf-8');
  const schema2 = fs.readFileSync(path.join(migrationsDir, '0002_users_and_roles.sql'), 'utf-8');

  const cleanSql = (sql) => sql
    .replace(/create extension[^;]+;/gi, '')
    .replace(/create or replace function[\s\S]*?\$\$ language plpgsql;/gi, '')
    .replace(/drop trigger[\s\S]*?;/gi, '')
    .replace(/create trigger[\s\S]*?;/gi, '');

  db.public.none(cleanSql(schema1));
  db.public.none(cleanSql(schema2));

  // material_issues.serial_no (see migrations/0004_material_serial_no.sql —
  // 0001's table definition predates the "Serial No." field the frontend
  // and materials.routes.js both already rely on).
  db.public.none(`alter table material_issues add column if not exists serial_no text;`);

  // material_issues.plate_no (see migrations/0005_material_plate_no.sql —
  // ties a material issue to the vehicle it was issued for).
  db.public.none(`alter table material_issues add column if not exists plate_no text;`);

  // Create technical_tasks table
  db.public.none(`
    create table if not exists technical_tasks (
      id text primary key default gen_random_uuid(),
      task_code text not null,
      title text not null,
      cashier text not null,
      vehicle text,
      material text not null,
      technician text not null,
      priority text not null default 'Normal',
      status text not null default 'Pending',
      due_date text,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  // Seed default data
  db.public.none(`
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

    insert into finance_audit_periods (label, sort_order) values
      ('March 31',     1),
      ('April 1-30',   2),
      ('May 1-31',     3),
      ('June 1-30',    4),
      ('July 1-22',    5);

    insert into technical_tasks (task_code, title, cashier, vehicle, material, technician, priority, status, due_date, notes) values
      ('TSK-101', 'Replace POS battery pack', 'Rahel M.', 'ET-3-81604 (M-011)', 'POS Li-ion Battery', 'Dawit K. (Lead Hardware Tech)', 'High', 'In Progress', '2026-08-17', 'POS device shuts down after 10 prints; replace battery pack.'),
      ('TSK-102', 'Issue braided Type-C cable', 'Tigist D.', 'ET-3-85472 (M-031)', 'Braided Type-C Cable', 'Abel M. (Field Technician)', 'Normal', 'Pending', '2026-08-17', 'Cable pins bent during morning shift; replace with reinforced unit.'),
      ('TSK-103', '4G SIM card swap & sync test', 'Liya K.', 'ET-3-83190 (M-019)', 'Ethio Telecom 4G SIM', 'Kidus T. (POS Specialist)', 'Urgent', 'Completed', '2026-08-16', 'Offline sync error resolved; successfully tested 15 live card taps.'),
      ('TSK-104', 'Handover thermal receipt rolls', 'Sara W.', 'ET-3-87581 (M-044)', 'Thermal Paper Rolls (x5)', 'Yared G. (Hardware Support)', 'Normal', 'Completed', '2026-08-16', 'Dispatched 5 rolls to Ayer Tena terminal.'),
      ('TSK-105', 'Repair touch digitizer screen', 'Marta F.', 'ET-3-80211 (M-008)', 'POS Touch Digitizer', 'Dawit K. (Lead Hardware Tech)', 'High', 'Pending', '2026-08-18', 'Lower-right touch zone unresponsive for card confirmation.');
  `);

  const pgAdapter = db.adapters.createPg();
  pool = new pgAdapter.Pool();

  // Async seed for finance audit records
  (async () => {
    try {
      const periods = await pool.query('select id, label from finance_audit_periods order by sort_order');
      const pMap = {};
      for (const p of periods.rows) {
        pMap[p.label] = p.id;
      }

      const rec1 = await pool.query(
        'insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order) values ($1, $2, $3, $4, $5, $6) returning id',
        [1, 'LENSA BOGALE', 'Activate', 195, 1893, 1]
      );
      await pool.query('insert into finance_audit_entries (record_id, period_id, value) values ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9), ($1, $10, $11)',
        [rec1.rows[0].id, pMap['March 31'], 17, pMap['April 1-30'], 421, pMap['May 1-31'], 458, pMap['June 1-30'], 565, pMap['July 1-22'], 432]
      );

      const rec2 = await pool.query(
        'insert into finance_audit_records (cashier_name, row_type, total, sort_order) values ($1, $2, $3, $4) returning id',
        ['LENSA BOGALE', 'Corrupt', 37, 2]
      );
      await pool.query('insert into finance_audit_entries (record_id, period_id, value) values ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9), ($1, $10, $11)',
        [rec2.rows[0].id, pMap['March 31'], 1, pMap['April 1-30'], 7, pMap['May 1-31'], 8, pMap['June 1-30'], 9, pMap['July 1-22'], 12]
      );

      const rec3 = await pool.query(
        'insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order) values ($1, $2, $3, $4, $5, $6) returning id',
        [2, 'Tsega Befikadu', 'Activate', 143, 2062, 3]
      );
      await pool.query('insert into finance_audit_entries (record_id, period_id, value) values ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9), ($1, $10, $11)',
        [rec3.rows[0].id, pMap['March 31'], 17, pMap['April 1-30'], 546, pMap['May 1-31'], 428, pMap['June 1-30'], 634, pMap['July 1-22'], 437]
      );

      const rec4 = await pool.query(
        'insert into finance_audit_records (cashier_name, row_type, total, sort_order) values ($1, $2, $3, $4) returning id',
        ['Tsega Befikadu', 'Corrupt', 33, 4]
      );
      await pool.query('insert into finance_audit_entries (record_id, period_id, value) values ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9), ($1, $10, $11)',
        [rec4.rows[0].id, pMap['March 31'], 1, pMap['April 1-30'], 9, pMap['May 1-31'], 4, pMap['June 1-30'], 13, pMap['July 1-22'], 6]
      );

      const rec5 = await pool.query(
        'insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order) values ($1, $2, $3, $4, $5, $6) returning id',
        [3, 'Melat Tewodros', 'Activate', 133, 2470, 5]
      );
      await pool.query('insert into finance_audit_entries (record_id, period_id, value) values ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9), ($1, $10, $11)',
        [rec5.rows[0].id, pMap['March 31'], 3, pMap['April 1-30'], 601, pMap['May 1-31'], 478, pMap['June 1-30'], 850, pMap['July 1-22'], 538]
      );

      const rec6 = await pool.query(
        'insert into finance_audit_records (cashier_name, row_type, total, sort_order) values ($1, $2, $3, $4) returning id',
        ['Melat Tewodros', 'Corrupt', 32, 6]
      );
      await pool.query('insert into finance_audit_entries (record_id, period_id, value) values ($1, $2, $3), ($1, $4, $5), ($1, $6, $7), ($1, $8, $9)',
        [rec6.rows[0].id, pMap['April 1-30'], 8, pMap['May 1-31'], 9, pMap['June 1-30'], 9, pMap['July 1-22'], 6]
      );

      // eslint-disable-next-line no-console
      console.log('[db] In-memory PostgreSQL database initialized and seeded successfully.');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[db] Error seeding local database:', err);
    }
  })();
}

module.exports = { pool };
