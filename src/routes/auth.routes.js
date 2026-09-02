const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/pool');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// 'admin' and 'staff' are the original roles. 'reception' behaves like
// staff but can also edit/delete Issue Material records. 'reports' is a
// restricted account limited to the Reports, Tasks, and Finance Audit
// views (enforced on the frontend; kept here just for validation).
const VALID_ROLES = ['admin', 'staff', 'reception', 'reports'];

function toUserDto(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
  );
}

// POST /api/auth/login  { email, password }
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'email and password are required');

  const { rows } = await pool.query('select * from users where email = $1', [String(email).trim().toLowerCase()]);
  const user = rows[0];

  // Same error for "no such user" and "wrong password" — don't leak which one.
  const invalid = () => { throw new HttpError(401, 'Invalid email or password'); };
  if (!user) invalid();
  if (user.status !== 'Active') throw new HttpError(403, 'This account is disabled');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) invalid();

  res.json({ token: signToken(user), user: toUserDto(user) });
}));

// GET /api/auth/me  (any logged-in user)
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from users where id = $1', [req.user.id]);
  if (!rows.length) throw new HttpError(404, 'User not found');
  res.json(toUserDto(rows[0]));
}));

// GET /api/auth/users  (admin only)
router.get('/users', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('select * from users order by created_at asc');
  res.json(rows.map(toUserDto));
}));

// POST /api/auth/users  (admin only) — create a staff or admin account
router.post('/users', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) throw new HttpError(400, 'name, email, and password are required');
  if (password.length < 8) throw new HttpError(400, 'password must be at least 8 characters');

  const hash = await bcrypt.hash(password, 10);
  const finalRole = VALID_ROLES.includes(role) ? role : 'staff';

  const { rows } = await pool.query(
    `insert into users (name, email, password_hash, role) values ($1,$2,$3,$4) returning *`,
    [name.trim(), String(email).trim().toLowerCase(), hash, finalRole]
  );
  res.status(201).json(toUserDto(rows[0]));
}));

// PUT /api/auth/users/:id  (admin only) — edit role/status/name, optionally reset password
router.put('/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const { rows: existingRows } = await pool.query('select * from users where id = $1', [req.params.id]);
  if (!existingRows.length) throw new HttpError(404, 'User not found');
  const current = existingRows[0];
  const { name, role, status, password } = req.body || {};

  const passwordHash = password ? await bcrypt.hash(password, 10) : current.password_hash;

  const { rows } = await pool.query(
    `update users set name=$1, role=$2, status=$3, password_hash=$4 where id=$5 returning *`,
    [
      name !== undefined ? name : current.name,
      role !== undefined && VALID_ROLES.includes(role) ? role : current.role,
      status !== undefined && ['Active', 'Inactive'].includes(status) ? status : current.status,
      passwordHash,
      current.id,
    ]
  );
  res.json(toUserDto(rows[0]));
}));

// DELETE /api/auth/users/:id  (admin only)
router.delete('/users/:id', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  if (req.user.id === req.params.id) throw new HttpError(400, "You can't delete your own account");
  const { rowCount } = await pool.query('delete from users where id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'User not found');
  res.status(204).end();
}));

module.exports = router;
