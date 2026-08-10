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
  };
}

// GET /api/materials  (newest first, matching the frontend's .reverse())
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from material_issues order by created_at desc');
  res.json(rows.map(toMaterialDto));
}));

// POST /api/materials
router.post('/', asyncHandler(async (req, res) => {
  const { cashier, material, quantity, date, notes } = req.body || {};
  if (!cashier || !String(cashier).trim()) throw new HttpError(400, 'cashier is required');
  if (!material || !String(material).trim()) throw new HttpError(400, 'material is required');

  const { rows } = await pool.query(
    `insert into material_issues (cashier, material, quantity, issue_date, notes)
     values ($1,$2,$3,$4,$5) returning *`,
    [cashier.trim(), material.trim(), quantity || 1, date || new Date().toISOString().slice(0, 10), notes || null]
  );
  res.status(201).json(toMaterialDto(rows[0]));
}));

// DELETE /api/materials/:id  (admin only)
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from material_issues where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Material issue not found');
  res.status(204).end();
}));

module.exports = router;
