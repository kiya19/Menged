const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function toAuditorDto(row) {
  return {
    id: row.id,
    name: row.name,
    employeeId: row.employee_id,
    phone: row.phone || '',
    status: row.status,
  };
}

// GET /api/auditors
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from finance_auditors order by created_at asc');
  res.json(rows.map(toAuditorDto));
}));

// POST /api/auditors  (admin only)
router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, employeeId, phone, status } = req.body || {};
  if (!name || !String(name).trim()) throw new HttpError(400, 'name is required');

  const { rows } = await pool.query(
    `insert into finance_auditors (name, employee_id, phone, status)
     values ($1,$2,$3,$4)
     returning *`,
    [name.trim(), employeeId || null, phone || null, status === 'Inactive' ? 'Inactive' : 'Active']
  );
  res.status(201).json(toAuditorDto(rows[0]));
}));

// PUT /api/auditors/:id  (admin only)
router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('select * from finance_auditors where id = $1', [req.params.id]);
  if (!existingRows.length) throw new HttpError(404, 'Auditor not found');
  const current = existingRows[0];
  const { name, employeeId, phone, status } = req.body || {};

  const { rows } = await pool.query(
    `update finance_auditors set name=$1, employee_id=$2, phone=$3, status=$4 where id=$5 returning *`,
    [
      name !== undefined ? name : current.name,
      employeeId !== undefined ? employeeId : current.employee_id,
      phone !== undefined ? phone : current.phone,
      status !== undefined ? status : current.status,
      req.params.id,
    ]
  );
  res.json(toAuditorDto(rows[0]));
}));

// DELETE /api/auditors/:id  (admin only)
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from finance_auditors where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Auditor not found');
  res.status(204).end();
}));

module.exports = router;
