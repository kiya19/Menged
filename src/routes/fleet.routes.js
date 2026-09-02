const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth); // every fleet route requires a logged-in user

const STATUSES = ['Active', 'Idle', 'Unassigned'];

function toVehicleDto(row) {
  return {
    id: row.id,
    plate: row.plate,
    side: row.side || '',
    type: row.type || '',
    route: row.route || '',
    driver: row.driver || '',
    cashier: row.cashier || '',
    pos: row.pos || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/fleet
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from vehicles order by created_at asc');
  res.json(rows.map(toVehicleDto));
}));

// GET /api/fleet/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from vehicles where id = $1', [req.params.id]);
  if (!rows.length) throw new HttpError(404, 'Vehicle not found');
  res.json(toVehicleDto(rows[0]));
}));

// POST /api/fleet
router.post('/', asyncHandler(async (req, res) => {
  const { plate, side, type, route, driver, cashier, pos, status } = req.body || {};
  if (!plate || !String(plate).trim()) throw new HttpError(400, 'plate is required');
  const finalStatus = STATUSES.includes(status) ? status : 'Unassigned';

  const { rows } = await pool.query(
    `insert into vehicles (plate, side, type, route, driver, cashier, pos, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [plate.trim(), side || null, type || null, route || null, driver || null, cashier || null, pos || null, finalStatus]
  );
  res.status(201).json(toVehicleDto(rows[0]));
}));

// PUT /api/fleet/:id  (partial update — used for driver/cashier/POS/status assignment)
router.put('/:id', asyncHandler(async (req, res) => {
  const { plate, side, type, route, driver, cashier, pos, status } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
  }

  const { rows: existingRows } = await pool.query('select * from vehicles where id = $1', [req.params.id]);
  if (!existingRows.length) throw new HttpError(404, 'Vehicle not found');
  const current = existingRows[0];

  const merged = {
    plate: plate !== undefined ? plate : current.plate,
    side: side !== undefined ? side : current.side,
    type: type !== undefined ? type : current.type,
    route: route !== undefined ? route : current.route,
    driver: driver !== undefined ? driver : current.driver,
    cashier: cashier !== undefined ? cashier : current.cashier,
    pos: pos !== undefined ? pos : current.pos,
    status: status !== undefined ? status : current.status,
  };

  const { rows } = await pool.query(
    `update vehicles set plate=$1, side=$2, type=$3, route=$4, driver=$5, cashier=$6, pos=$7, status=$8
     where id=$9 returning *`,
    [merged.plate, merged.side, merged.type, merged.route, merged.driver, merged.cashier, merged.pos, merged.status, req.params.id]
  );
  res.json(toVehicleDto(rows[0]));
}));

// DELETE /api/fleet/:id  (admin only)
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from vehicles where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Vehicle not found');
  res.status(204).end();
}));

// POST /api/fleet/import  — bulk upsert by plate number, for the CSV/Excel importer (admin only)
router.post('/import', requireRole('admin'), asyncHandler(async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!records.length) throw new HttpError(400, 'records array is required');

  const client = await pool.connect();
  const imported = [];
  try {
    await client.query('begin');
    for (const record of records) {
      const { plate, side, type, driver, cashier, pos, route, status } = record || {};
      if (!plate || !String(plate).trim()) continue;
      // null (not 'Unassigned') when the import row doesn't specify a valid
      // status, so a re-import that omits status doesn't clobber an existing
      // vehicle's status back to Unassigned — see the two coalesce()s below.
      const finalStatus = STATUSES.includes(status) ? status : null;
      const { rows } = await client.query(
        `insert into vehicles (plate, side, type, route, driver, cashier, pos, status)
         values ($1,$2,$3,$4,$5,$6,$7, coalesce($8, 'Unassigned'))
         on conflict (plate) do update set
           side = coalesce(excluded.side, vehicles.side),
           type = coalesce(excluded.type, vehicles.type),
           route = coalesce(excluded.route, vehicles.route),
           driver = coalesce(excluded.driver, vehicles.driver),
           cashier = coalesce(excluded.cashier, vehicles.cashier),
           pos = coalesce(excluded.pos, vehicles.pos),
           status = coalesce($8, vehicles.status)
         returning *`,
        [String(plate).trim(), side || null, type || null, route || null, driver || null, cashier || null, pos || null, finalStatus]
      );
      imported.push(toVehicleDto(rows[0]));
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }

  res.status(201).json({ imported: imported.length, vehicles: imported });
}));

module.exports = router;
