const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// NOTE: the `cashier` column/field predates the "IT Technician" relabel in
// the Issue Material UI. It's kept as-is here to avoid a schema/API
// rename, but it now holds the name of the IT technician the material was
// issued to, not a bus cashier.
function toMaterialDto(row) {
  return {
    id: row.id,
    cashier: row.cashier,
    plateNo: row.plate_no || '',
    material: row.material,
    quantity: Number(row.quantity),
    date: row.issue_date,
    notes: row.notes || '',
    serialNo: row.serial_no || '',
  };
}

// GET /api/materials  (newest first, matching the frontend's .reverse())
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from material_issues order by created_at desc');
  res.json(rows.map(toMaterialDto));
}));

// POST /api/materials
router.post('/', asyncHandler(async (req, res) => {
  const { cashier, plateNo, material, quantity, date, notes, serialNo } = req.body || {};
  if (!cashier || !String(cashier).trim()) throw new HttpError(400, 'cashier is required');
  if (!material || !String(material).trim()) throw new HttpError(400, 'material is required');

  const { rows } = await pool.query(
    `insert into material_issues (cashier, plate_no, material, quantity, issue_date, notes, serial_no)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [cashier.trim(), plateNo ? plateNo.trim() : null, material.trim(), quantity || 1, date || new Date().toISOString().slice(0, 10), notes || null, serialNo ? serialNo.trim() : null]
  );
  res.status(201).json(toMaterialDto(rows[0]));
}));

// Only admin and reception may edit or delete a material issue — any
// authenticated user (including plain 'staff') can still view and add.
const requireMaterialsManager = requireRole('admin', 'reception');

// PUT /api/materials/:id  (admin + reception only)
router.put('/:id', requireMaterialsManager, asyncHandler(async (req, res) => {
  const { cashier, plateNo, material, quantity, date, notes, serialNo } = req.body || {};
  const { rows } = await pool.query(
    `update material_issues set
       cashier = coalesce($2, cashier),
       plate_no = coalesce($3, plate_no),
       material = coalesce($4, material),
       quantity = coalesce($5, quantity),
       issue_date = coalesce($6, issue_date),
       notes = coalesce($7, notes),
       serial_no = coalesce($8, serial_no)
     where id = $1 returning *`,
    [req.params.id, cashier, plateNo, material, quantity, date, notes, serialNo]
  );
  if (!rows.length) throw new HttpError(404, 'Material issue not found');
  res.json(toMaterialDto(rows[0]));
}));

// DELETE /api/materials/:id  (admin + reception only)
router.delete('/:id', requireMaterialsManager, asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from material_issues where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Material issue not found');
  res.status(204).end();
}));

module.exports = router;
