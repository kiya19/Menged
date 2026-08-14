require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { pool } = require('./db/pool');
const authRoutes = require('./routes/auth.routes');
const fleetRoutes = require('./routes/fleet.routes');
const auditorRoutes = require('./routes/auditors.routes');
const financeAuditRoutes = require('./routes/financeAudit.routes');
const materialRoutes = require('./routes/materials.routes');

if (!process.env.JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn('[auth] JWT_SECRET is not set — copy.env.m9K2pL7xQ4wR8tY1vN5bJ3cF6hD0sA2eZ to .env first.');
}

const app = express();
app.set('trust proxy', 1); // Render (and most hosts) sit behind a reverse proxy

// CORS_ORIGIN accepts a comma-separated list, e.g.
// "http://127.0.0.1:5500,https://menged-dashboard.onrender.com"
// so the same deploy can serve local dev and a public frontend at once.
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (allowedOrigins.includes('*') || !origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGIN`));
  },
}));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, db: 'connected' });
});
  } catch (err) {
    res.status(500).json({ ok: false, db: 'unreachable', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/auditors', auditorRoutes);
app.use('/api/finance-audit', financeAuditRoutes);
app.use('/api/materials', materialRoutes);

// 404 fallback
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (/not allowed by CORS_ORIGIN/.test(err.message || '')) {
    return res.status(403).json({ error: 'This origin is not allowed to call the API. Check CORS_ORIGIN.' });
  }
  // Postgres unique_violation -> 409 Conflict instead of a raw 500
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That value already exists (unique constraint).', detail: err.detail });
  }
  // Postgres foreign_key_violation -> 400
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist.', detail: err.detail });
  }

  const status = err.status || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Menged backend listening on http://localhost:${PORT}`);
});
