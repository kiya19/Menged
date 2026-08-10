# Menged Backend

Express REST API for the Menged Fleet Operations dashboard. It sits in front
of a Postgres database run locally by the **Supabase CLI** — the frontend
talks only to this API, never to Supabase directly.

Tested end-to-end against a real Postgres 16 instance before delivery
(schema, seed data, and every endpoint below).

## Architecture

```
Frontend (your HTML/JS)  →  this Express API  →  Supabase-managed Postgres (local)
```

Supabase here is just the Postgres box (run locally via `supabase start`,
which uses Docker). No PostgREST, no Row Level Security, no Supabase Auth —
this API is the only thing that talks to the database, using a normal
`pg` connection pool. That keeps the whole system in territory you already
know (Express routes, SQL), and you can layer Supabase's other features
(Auth, Storage, hosted Postgres for production) on top later without
changing how the frontend calls this API.

## 1. Prerequisites

- Node.js 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Supabase CLI uses it to run Postgres locally)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — `npm install -g supabase` or `brew install supabase/tap/supabase`

## 2. Start local Supabase (Postgres)

From this project's root folder:

```bash
supabase init      # only if this folder has no supabase/config.toml yet — it will NOT touch your migrations/seed.sql
supabase start
```

`supabase start` prints a block like this — note the **DB URL**:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
```

Studio URL is a web GUI for browsing the database if you want to eyeball tables.

Apply the schema + seed data:

```bash
supabase db reset
```

This runs everything in `supabase/migrations/` (currently `0001_init_schema.sql`)
followed by `supabase/seed.sql`, which loads the same demo fleet/auditors/
finance-audit/materials data your frontend currently seeds into localStorage.

## 3. Run the API

```bash
npm install
cp .env.example .env
# edit .env if your DB URL, port, or frontend origin differ from the defaults
npm run dev        # nodemon, restarts on file changes
# or: npm start
```

Check it's alive:

```bash
curl http://localhost:4000/api/health
# {"ok":true,"db":"connected"}
```

## 4. Authentication & roles

Every route except `/api/auth/login` and `/api/health` requires a JWT in
the `Authorization: Bearer <token>` header. Two roles:

- **admin** — everything, including deletes, bulk imports, managing
  auditors, and managing user accounts.
- **staff** — day-to-day work: view everything, assign fleet, add finance
  records, log material issues. Blocked from deletes/imports/user & auditor
  management (gets a `403`).

Local seed accounts (`supabase/seed.sql` — **change these before sharing
this anywhere**):

| Role | Email | Password |
|---|---|---|
| admin | `admin@menged.et` | `Admin@123` |
| staff | `staff@menged.et` | `Staff@123` |

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@menged.et","password":"Admin@123"}'
# → { "token": "...", "user": { "id", "name", "email", "role", "status" } }

curl http://localhost:4000/api/fleet -H "Authorization: Bearer <token>"
```

### Auth endpoints — `/api/auth`

| Method | Path | Body | Who |
|---|---|---|---|
| POST | `/login` | `{email, password}` | anyone |
| GET | `/me` | – | any logged-in user |
| GET | `/users` | – | admin |
| POST | `/users` | `{name, email, password, role}` | admin |
| PUT | `/users/:id` | any subset, incl. `password` to reset it | admin |
| DELETE | `/users/:id` | – | admin (can't delete yourself) |

## 5. API reference

All routes are prefixed `/api`. Bodies and responses are JSON.

### Fleet — `/api/fleet`

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/` | – | List all vehicles |
| GET | `/:id` | – | One vehicle |
| POST | `/` | `{plate, side, type, route, driver, cashier, pos, status}` | `plate` required; `status` ∈ `Active/Idle/Unassigned` |
| PUT | `/:id` | any subset of the above | Partial update — used for driver/cashier/POS/status assignment |
| DELETE | `/:id` | – | |
| POST | `/import` | `{records: [{plate, side, type, driver, cashier, pos, route, status}, ...]}` | Bulk upsert by `plate` for the CSV/Excel importer |

### Finance auditors — `/api/auditors`

| Method | Path | Body |
|---|---|---|
| GET | `/` | – |
| POST | `/` | `{name, employeeId, phone, status}` |
| PUT | `/:id` | any subset |
| DELETE | `/:id` | – |

### Finance audit — `/api/finance-audit`

The frontend's finance-audit table has **dynamic date columns** (new ones get
added over time), so under the hood this isn't stored as a raw grid — it's
normalized into three tables (`finance_audit_periods`, `finance_audit_records`,
`finance_audit_entries`). The API hides that: every response gives you back
the same `{headers, rows}` shape your current `financeAudit` object already
uses, so the render logic barely has to change.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/` | – | Returns `{headers, rows, recordIds}` — `recordIds[i]` is the DB id for `rows[i]`, use it for edit/delete |
| POST | `/records` | `{cashierName, rowType: "Activate"\|"Corrupt", periodValues: {"March 31": 17, ...}, onHand}` | Appends a row; total is computed server-side |
| PUT | `/records/:id` | any subset of the above | `periodValues` only updates the labels you include; total is recomputed |
| DELETE | `/records/:id` | – | |
| POST | `/columns` | `{label}` | Adds a new period column; backfills `0` for every existing row |
| POST | `/import` | `{headers: [...], rows: [[...], ...]}` | Replaces the entire grid — wire this to the existing "Upload Excel" button |

### Material issues — `/api/materials`

| Method | Path | Body |
|---|---|---|
| GET | `/` | – (newest first) |
| POST | `/` | `{cashier, material, quantity, date, notes}` |
| DELETE | `/:id` | – |

## 6. Wiring up the frontend

The dashboard currently reads/writes through functions like `loadData()` /
`persist()` per section, backed by `localStorage`. The swap is mechanical —
same shapes, different transport. Example for the fleet section:

```js
const API = 'http://localhost:4000/api';

// was: function loadData() { return JSON.parse(localStorage.getItem('mengedFleetDemo')) || seed; }
async function loadData() {
  const res = await fetch(`${API}/fleet`);
  return res.json();
}

// was: function persist() { localStorage.setItem('mengedFleetDemo', JSON.stringify(fleet)); }
// persist() goes away entirely — each mutation calls the API directly instead
// of rewriting the whole array, e.g. inside assignmentForm's submit handler:
async function saveBus(id, changes) {
  const res = await fetch(`${API}/fleet/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return res.json();
}
```

Same pattern for auditors/materials. Finance-audit is the one place the
*shape* is identical (`{headers, rows}`) but edits go through
`recordIds[rowIndex]` instead of a plain array index — see the table above.

## 7. What's deliberately not in here yet

This is the local-first pass, scoped to what you asked for:

- **Auth is local-dev grade** — JWTs signed with a plain secret in `.env`,
  no refresh tokens, no password-reset flow, no rate limiting on `/login`.
  Fine for local dev; before this goes anywhere shared, rotate `JWT_SECRET`
  to a real random value, add rate limiting on login attempts, and consider
  short-lived tokens + refresh tokens instead of a flat 12h expiry.
- **No production deploy config** — for that, either point `DATABASE_URL` at
  a hosted Supabase project's Postgres connection string, or keep the CLI's
  local stack for dev and stand up the same schema against production via
  `supabase db push`.
- **No automated tests** — I validated every route manually against a real
  Postgres instance while building this; a `tests/` folder with something
  like `vitest` + `supertest` would be a reasonable next step.

## 8. Project layout

```
menged-backend/
  src/
    server.js              — Express app, CORS, error handling
    db/pool.js              — pg connection pool
    middleware/auth.js      — requireAuth + requireRole JWT middleware
    routes/
      auth.routes.js        — login, me, user management
      fleet.routes.js
      auditors.routes.js
      financeAudit.routes.js
      materials.routes.js
    utils/http.js           — asyncHandler + HttpError helper
  supabase/
    migrations/
      0001_init_schema.sql
      0002_users_and_roles.sql
    seed.sql
  .env.example
  package.json
```

## 9. Login page

`login.html` (delivered alongside this zip, not inside it — it's a frontend
file) is a standalone branded login screen wired to `POST /api/auth/login`.
Drop it next to `Menged-Fleet-Dashboard.html` and open it in a browser with
the API running — it stores the JWT in `localStorage`/`sessionStorage`
depending on "Keep me signed in," then redirects to the dashboard. The
"Local demo accounts" panel at the bottom fills in the seeded admin/staff
credentials for quick testing — remove that block once real accounts exist.
