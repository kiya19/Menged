const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL is not set — copy .env.example to .env first.');
}

// Hosted Supabase (and most managed Postgres) require SSL; local Postgres
// (including `supabase start`'s local instance) does not speak SSL at all.
// Auto-detect by host so the same code works in both places, unless
// DATABASE_SSL is set explicitly.
function shouldUseSsl() {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;
  const url = process.env.DATABASE_URL || '';
  return /supabase\.co|render\.com|amazonaws\.com/.test(url);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected error on idle client', err);
});

module.exports = { pool };

