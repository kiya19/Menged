# Deploying publicly (Supabase Cloud + Render)

Two accounts, both free tiers, ~15 minutes total. I can't click through these
dashboards for you — Render and Supabase both need your own login — but
everything on the code side is already set up. Follow these in order.

## 1. Push this code to GitHub

Render deploys from a Git repo. If this backend isn't in one yet:

```bash
cd menged-backend
git init
git add .
git commit -m "Menged backend"
```

Create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/<you>/menged-backend.git
git push -u origin main
```

## 2. Create a Supabase Cloud project

1. Go to **supabase.com/dashboard** → **New Project**.
2. Pick a name, a database password (save it), and a region close to you.
3. Wait ~2 minutes for it to provision.
4. **Settings → Database → Connection string** → copy the **URI** under
   "Connection pooling" (mode: *Session*). It looks like:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-xxxx.pooler.supabase.com:5432/postgres
   ```
   Replace `[YOUR-PASSWORD]` with the password from step 2. **This is your
   production `DATABASE_URL`.**

### Apply the schema + seed data

Easiest path — Supabase's SQL Editor, no CLI needed:

1. **SQL Editor → New query**, paste the contents of
   `supabase/migrations/0001_init_schema.sql`, run it.
2. New query again, paste `supabase/migrations/0002_users_and_roles.sql`, run it.
3. New query again, paste `supabase/seed.sql`, run it.

(If you have the Supabase CLI installed and prefer it: `supabase link --project-ref <ref>` then `supabase db push`.)

**Change the seeded passwords once this is live** — `admin@menged.et` /
`Admin@123` and `staff@menged.et` / `Staff@123` are fine for local dev, not
for a public URL. Easiest: log in as admin once deployed, then
`PUT /api/auth/users/:id` with a new `password` for each account (get IDs
from `GET /api/auth/users`).

## 3. Deploy the API to Render

1. Go to **render.com/dashboard** → **New +** → **Blueprint**.
2. Connect the GitHub repo from step 1. Render reads `render.yaml`
   automatically and shows one service: `menged-backend`.
3. Before deploying, fill in the two env vars it flags as needed:
   - `DATABASE_URL` → the Supabase connection string from step 2.
   - `CORS_ORIGIN` → `*` is fine here — since the frontend is served from
     this same service (see step 5 below), it's same-origin and CORS
     doesn't really come into play. `*` only matters if something external
     ever calls this API directly.
   - `JWT_SECRET` is generated for you automatically — leave it.
4. Click **Apply**. First deploy takes 2–3 minutes.
5. Once live, check `https://menged-backend.onrender.com/api/health` (your
   actual URL is shown in the Render dashboard — it may have a random
   suffix if that exact name was taken) → should return
   `{"ok":true,"db":"connected"}`.

Note: Render's free tier spins the service down after ~15 minutes idle and
takes ~30–50s to wake back up on the next request. Fine for a demo; if that
matters for real use, upgrade the plan later.

## 4. Point the login page at your live API

In `login.html`, find this block near the bottom and replace the placeholder
with your actual Render URL from step 3:

```js
return isLocal
  ? 'http://localhost:4000/api'
  : 'https://menged-backend.onrender.com/api'; // 👉 replace with your Render URL
```

Locally (opening the file directly, or `localhost`) it still talks to your
local backend automatically — no edit needed for that case.

## 5. That's it — one service, one URL

Earlier versions of this guide had you deploy the frontend as a second
Render service. That's no longer needed: `src/server.js` now serves
`login.html` and the dashboard directly from the same backend service, so
`https://menged.onrender.com` shows your login page and
`https://menged.onrender.com/dashboard` shows the fleet dashboard — both
from the one service you already deployed.

## Quick reference

| Piece | Where | Public URL |
|---|---|---|
| Database | Supabase Cloud | (not public — only the API talks to it) |
| API + login page + dashboard | Render (this repo) | `https://menged.onrender.com` |
