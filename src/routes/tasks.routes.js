const express = require('express');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function toTaskDto(row) {
  return {
    id: row.id,
    taskCode: row.task_code || 'TSK-' + String(row.id).slice(0, 4).toUpperCase(),
    title: row.title,
    cashier: row.cashier,
    vehicle: row.vehicle || '',
    material: row.material,
    technician: row.technician,
    priority: row.priority || 'Normal',
    status: row.status || 'Pending',
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/tasks (list all tasks, sorted by status and newest first)
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    select * from technical_tasks 
    order by 
      case status 
        when 'In Progress' then 1 
        when 'Pending' then 2 
        when 'Completed' then 3 
        when 'Cancelled' then 4 
        else 5 
      end, 
      created_at desc
  `);
  res.json(rows.map(toTaskDto));
}));

// POST /api/tasks (create a new technical material task)
router.post('/', asyncHandler(async (req, res) => {
  const { title, cashier, vehicle, material, technician, priority, status, dueDate, notes } = req.body || {};
  if (!cashier || !String(cashier).trim()) throw new HttpError(400, 'cashier is required');
  if (!material || !String(material).trim()) throw new HttpError(400, 'material is required');
  if (!technician || !String(technician).trim()) throw new HttpError(400, 'technician is required');

  const taskCode = 'TSK-' + Math.floor(100 + Math.random() * 900);
  const taskTitle = title && String(title).trim() ? title.trim() : `Change ${material.trim()} for ${cashier.trim()}`;

  const { rows } = await pool.query(
    `insert into technical_tasks (task_code, title, cashier, vehicle, material, technician, priority, status, due_date, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [
      taskCode,
      taskTitle,
      cashier.trim(),
      vehicle ? vehicle.trim() : null,
      material.trim(),
      technician.trim(),
      priority || 'Normal',
      status || 'Pending',
      dueDate || new Date().toISOString().slice(0, 10),
      notes ? notes.trim() : null,
    ]
  );
  res.status(201).json(toTaskDto(rows[0]));
}));

// PUT /api/tasks/:id (update a task's status, technician, material, or notes)
router.put('/:id', asyncHandler(async (req, res) => {
  const { title, cashier, vehicle, material, technician, priority, status, dueDate, notes } = req.body || {};
  
  const { rows } = await pool.query(
    `update technical_tasks set
       title = coalesce($2, title),
       cashier = coalesce($3, cashier),
       vehicle = coalesce($4, vehicle),
       material = coalesce($5, material),
       technician = coalesce($6, technician),
       priority = coalesce($7, priority),
       status = coalesce($8, status),
       due_date = coalesce($9, due_date),
       notes = coalesce($10, notes),
       updated_at = now()
     where id = $1 returning *`,
    [req.params.id, title, cashier, vehicle, material, technician, priority, status, dueDate, notes]
  );
  if (!rows.length) throw new HttpError(404, 'Task not found');
  res.json(toTaskDto(rows[0]));
}));

// DELETE /api/tasks/:id (admin only)
router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const { rowCount } = await pool.query('delete from technical_tasks where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Task not found');
  res.status(204).end();
}));

module.exports = router;
