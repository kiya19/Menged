const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function toMaterialDto(row) {
  return {
    id: row.id,
    cashier: row.cashier,
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
  const { cashier, material, quantity, date, notes, serialNo } = req.body || {};
  if (!cashier || !String(cashier).trim()) throw new HttpError(400, 'cashier is required');
  if (!material || !String(material).trim()) throw new HttpError(400, 'material is required');

  const { rows } = await pool.query(
    `insert into material_issues (cashier, material, quantity, issue_date, notes, serial_no)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [cashier.trim(), material.trim(), quantity || 1, date || new Date().toISOString().slice(0, 10), notes || null, serialNo ? serialNo.trim() : null]
  );
  res.status(201).json(toMaterialDto(rows[0]));
}));

// PUT /api/materials/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const { cashier, material, quantity, date, notes, serialNo } = req.body || {};
  const { rows } = await pool.query(
    `update material_issues set
       cashier = coalesce($2, cashier),
       material = coalesce($3, material),
       quantity = coalesce($4, quantity),
       issue_date = coalesce($5, issue_date),
       notes = coalesce($6, notes),
       serial_no = coalesce($7, serial_no)
     where id = $1 returning *`,
    [req.params.id, cashier, material, quantity, date, notes, serialNo]
  );
  if (!rows.length) throw new HttpError(404, 'Material issue not found');
  res.json(toMaterialDto(rows[0]));
}));

// DELETE /api/materials/:id  (admin only)
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from material_issues where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Material issue not found');
  res.status(204).end();
}));

module.exports = router;
