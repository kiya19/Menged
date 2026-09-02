const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function numericValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/[, _]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

// Rebuilds the {headers, rows} grid the frontend already knows how to render,
// out of the normalized periods / records / entries tables.
async function getFinanceAuditGrid(client = pool) {
  const [{ rows: periods }, { rows: records }, { rows: entries }] = await Promise.all([
    client.query('select * from finance_audit_periods order by sort_order asc'),
    client.query('select * from finance_audit_records order by sort_order asc, created_at asc'),
    client.query('select * from finance_audit_entries'),
  ]);

  const entryMap = new Map();
  entries.forEach((e) => entryMap.set(`${e.record_id}:${e.period_id}`, Number(e.value)));

  const headers = ['S/No', 'Name', 'Status', ...periods.map((p) => p.label), 'Total', 'On hand'];
  const rows = records.map((r) => {
    const periodValues = periods.map((p) => {
      const key = `${r.id}:${p.id}`;
      return entryMap.has(key) ? entryMap.get(key) : 0;
    });
    return {
      id: r.id,
      cells: [
        r.seq_no === null ? '' : r.seq_no,
        r.cashier_name,
        r.row_type,
        ...periodValues,
        Number(r.total),
        r.on_hand === null ? '' : Number(r.on_hand),
      ],
    };
  });

  return { headers, periods, rows };
}

// GET /api/finance-audit
router.get('/', asyncHandler(async (req, res) => {
  const grid = await getFinanceAuditGrid();
  res.json({
    headers: grid.headers,
    rows: grid.rows.map((r) => r.cells),
    // recordIds lines up 1:1 with rows, for edit/delete calls from the frontend
    recordIds: grid.rows.map((r) => r.id),
  });
}));

// POST /api/finance-audit/records  { cashierName, rowType, periodValues: {label: value}, onHand }
router.post('/records', asyncHandler(async (req, res) => {
  const { cashierName, rowType, periodValues, onHand } = req.body || {};
  if (!cashierName || !String(cashierName).trim()) throw new HttpError(400, 'cashierName is required');
  if (!['Activate', 'Corrupt'].includes(rowType)) throw new HttpError(400, "rowType must be 'Activate' or 'Corrupt'");

  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: periods } = await client.query('select * from finance_audit_periods order by sort_order asc');
    const total = periods.reduce((sum, p) => sum + numericValue((periodValues || {})[p.label]), 0);

    let seqNo = null;
    if (rowType === 'Activate') {
      const { rows: countRows } = await client.query(
        "select count(*)::int as n from finance_audit_records where row_type = 'Activate'"
      );
      seqNo = countRows[0].n + 1;
    }

    const { rows: maxSortRows } = await client.query(
      'select coalesce(max(sort_order), 0) as max_sort from finance_audit_records'
    );
    const sortOrder = maxSortRows[0].max_sort + 1;

    const { rows: inserted } = await client.query(
      `insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [seqNo, cashierName.trim(), rowType, onHand === '' || onHand === undefined ? null : numericValue(onHand), total, sortOrder]
    );
    const record = inserted[0];

    for (const period of periods) {
      const value = numericValue((periodValues || {})[period.label]);
      await client.query(
        'insert into finance_audit_entries (record_id, period_id, value) values ($1,$2,$3)',
        [record.id, period.id, value]
      );
    }

    await client.query('commit');
    const grid = await getFinanceAuditGrid();
    res.status(201).json({ headers: grid.headers, rows: grid.rows.map((r) => r.cells), recordIds: grid.rows.map((r) => r.id) });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}));

// PUT /api/finance-audit/records/:id
router.put('/records/:id', asyncHandler(async (req, res) => {
  const { cashierName, rowType, periodValues, onHand } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('begin');

    const { rows: existingRows } = await client.query(
      'select * from finance_audit_records where id = $1 for update',
      [req.params.id]
    );
    if (!existingRows.length) throw new HttpError(404, 'Finance audit record not found');
    const current = existingRows[0];

    if (periodValues && typeof periodValues === 'object') {
      const { rows: periods } = await client.query('select * from finance_audit_periods');
      for (const period of periods) {
        if (!(period.label in periodValues)) continue;
        const value = numericValue(periodValues[period.label]);
        await client.query(
          `insert into finance_audit_entries (record_id, period_id, value)
           values ($1,$2,$3)
           on conflict (record_id, period_id) do update set value = excluded.value`,
          [current.id, period.id, value]
        );
      }
    }

    const { rows: entryRows } = await client.query(
      'select value from finance_audit_entries where record_id = $1',
      [current.id]
    );
    const total = entryRows.reduce((sum, e) => sum + Number(e.value), 0);

    const { rows: updated } = await client.query(
      `update finance_audit_records
       set cashier_name = $1, row_type = $2, on_hand = $3, total = $4
       where id = $5 returning *`,
      [
        cashierName !== undefined ? String(cashierName).trim() : current.cashier_name,
        rowType !== undefined && ['Activate', 'Corrupt'].includes(rowType) ? rowType : current.row_type,
        onHand === '' ? null : (onHand !== undefined ? numericValue(onHand) : current.on_hand),
        total,
        current.id,
      ]
    );

    await client.query('commit');
    const grid = await getFinanceAuditGrid();
    res.json({ headers: grid.headers, rows: grid.rows.map((r) => r.cells), recordIds: grid.rows.map((r) => r.id), updated: updated[0].id });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}));

// DELETE /api/finance-audit/records/:id  (admin only)
router.delete('/records/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from finance_audit_records where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Finance audit record not found');
  res.status(204).end();
}));

// POST /api/finance-audit/columns  { label }
router.post('/columns', asyncHandler(async (req, res) => {
  const { label } = req.body || {};
  if (!label || !String(label).trim()) throw new HttpError(400, 'label is required');

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: maxSortRows } = await client.query(
      'select coalesce(max(sort_order), 0) as max_sort from finance_audit_periods'
    );
    const sortOrder = maxSortRows[0].max_sort + 1;

    const { rows: inserted } = await client.query(
      'insert into finance_audit_periods (label, sort_order) values ($1,$2) returning *',
      [label.trim(), sortOrder]
    );
    const period = inserted[0];

    const { rows: records } = await client.query('select id from finance_audit_records');
    for (const record of records) {
      await client.query(
        'insert into finance_audit_entries (record_id, period_id, value) values ($1,$2,0)',
        [record.id, period.id]
      );
    }

    await client.query('commit');
    const grid = await getFinanceAuditGrid();
    res.status(201).json({ headers: grid.headers, rows: grid.rows.map((r) => r.cells), recordIds: grid.rows.map((r) => r.id) });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}));

// POST /api/finance-audit/import  { headers, rows } — replaces the whole grid,
// for the "Upload Excel" bulk-import flow. (admin only — it wipes existing data)
router.post('/import', requireRole('admin'), asyncHandler(async (req, res) => {
  const { headers, rows } = req.body || {};
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new HttpError(400, 'headers and rows arrays are required');
  }

  let totalIdx = headers.findIndex((h) => String(h).toLowerCase() === 'total');
  let onHandIdx = headers.findIndex((h) => String(h).toLowerCase() === 'on hand');
  if (totalIdx < 0) totalIdx = headers.length - 2;
  if (onHandIdx < 0) onHandIdx = headers.length - 1;
  const periodLabels = headers.slice(3, totalIdx);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('truncate finance_audit_entries, finance_audit_records, finance_audit_periods restart identity cascade');

    const periodIds = [];
    for (let i = 0; i < periodLabels.length; i += 1) {
      const { rows: inserted } = await client.query(
        'insert into finance_audit_periods (label, sort_order) values ($1,$2) returning id',
        [String(periodLabels[i]), i + 1]
      );
      periodIds.push(inserted[0].id);
    }

    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const seqNo = row[0] === '' || row[0] === undefined || row[0] === null ? null : Number(row[0]);
      const cashierName = row[1] || '';
      const rowType = ['Activate', 'Corrupt'].includes(row[2]) ? row[2] : 'Activate';
      const onHandVal = row[onHandIdx];
      const periodVals = periodLabels.map((_, i) => numericValue(row[3 + i]));
      const total = periodVals.reduce((sum, v) => sum + v, 0);

      const { rows: inserted } = await client.query(
        `insert into finance_audit_records (seq_no, cashier_name, row_type, on_hand, total, sort_order)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [seqNo, cashierName, rowType, onHandVal === '' || onHandVal === undefined ? null : numericValue(onHandVal), total, r + 1]
      );
      const recordId = inserted[0].id;

      for (let i = 0; i < periodIds.length; i += 1) {
        await client.query(
          'insert into finance_audit_entries (record_id, period_id, value) values ($1,$2,$3)',
          [recordId, periodIds[i], periodVals[i]]
        );
      }
    }

    await client.query('commit');
    const grid = await getFinanceAuditGrid();
    res.status(201).json({ headers: grid.headers, rows: grid.rows.map((r) => r.cells), recordIds: grid.rows.map((r) => r.id) });
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}));

module.exports = router;
