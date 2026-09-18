# MediFlow

Private-clinic appointment booking (pilot: 1 clinic). Sprint 1 Must **M1–M4** plus **M5 staging/seed**: a logged-in patient can request an appointment; a receptionist can view pending bookings and confirm or reject them; the patient sees the new status. Login is role-scoped (patient vs receptionist) and logout invalidates the server session. Demo data can be seeded and reset locally and on staging.

Vietnamese UI labels; code and comments in English.

## Stack

- Next.js (App Router) + TypeScript
- SQLite via Prisma
- Cookie session (signed JWT + server-side session row; logout deletes the row)
- Staging: long-running Node/Docker (Render / Railway / Fly). Vercel config is included but **not recommended** with a SQLite file (ephemeral serverless disk).

## Setup

```bash
cp .env.example .env
npm install
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run setup` generates the Prisma client, creates `prisma/dev.db`, and loads seed data.

## Seed credentials

Password for all demo users: `demo1234`

| Email | Role |
|-------|------|
| `patient@mediflow.demo` | Patient (M1 booking) |
| `patient2@mediflow.demo` | Second patient (double-booking check) |
| `receptionist@mediflow.demo` | Receptionist (M2 pending list, M3 confirm/reject) |

Seed also includes **1 clinic** (`Phòng khám Đa khoa MediFlow`), **2 doctors**, and **8 open slots**.

These passwords are for local/demo/staging only. Do not put production secrets in this repo.

## Seed / reset demo data

### Local

```bash
npm run db:seed    # re-seed (keeps schema)
npm run db:reset   # wipe SQLite file, recreate schema, seed
```

`npm run staging:start` (used in Docker/Render) runs `prisma db push`, then seeds when the database is empty (`SEED_ON_START=if-empty`, default). Set `SEED_ON_START=always` to re-seed on every process start, or `never` to skip.

### Staging (after a live URL exists)

1. Confirm seed inventory (no secrets): `GET /api/health`
2. Reset (wipes appointments and restores open slots + demo users):

```bash
curl -X POST "$STAGING_URL/api/staging/reset" \
  -H "Authorization: Bearer $STAGING_RESET_TOKEN"
```

The reset endpoint is **off** unless `STAGING_RESET_TOKEN` is set on the host. Generate that token in the host dashboard (Render `generateValue`, or `openssl rand -hex 24`). Do not commit the live token.

Optional local Docker reset token is `local-staging-reset` (docker-compose only).

## Staging URL

**Live URL: not published yet.** This environment has no Vercel / Render / Railway / Fly token, so a public hostname was not created from this PR. Do not use a placeholder URL.

After Brian completes the deploy steps below, paste the real origin here (and in the PR), for example `https://….onrender.com`.

Until then, a production-like replica is:

```bash
cp .env.example .env
docker compose up --build
```

Then open http://localhost:3000 and run `BASE_URL=http://127.0.0.1:3000 STAGING_RESET_TOKEN=local-staging-reset npm run smoke`.

## What Brian must click to get a live URL

**Recommended: Render** (free/starter Node web service, SQLite on the instance disk).

1. Log in at [https://render.com](https://render.com) with the GitHub account that can read `BrianDzung/mediflow-`.
2. **New → Blueprint** (or **New Web Service**). Connect this repo.
3. Use `render.yaml`. Branch: merge this PR to `main`, **or** deploy branch `cursor/m5-staging-seed-9e26` until merge.
4. Confirm env vars created by the blueprint: `AUTH_SECRET` and `STAGING_RESET_TOKEN` (auto-generated — not in git), `DATABASE_URL=file:./staging.db`, `SEED_ON_START=if-empty`.
5. Deploy. When the service is live, copy the `*.onrender.com` URL.
6. Open `/api/health` — `demoReady` should be `true`.
7. Add repo secret `STAGING_RESET_TOKEN` (same value as Render) so GitHub Action **Staging smoke** can run: Actions → Staging smoke → Run workflow → paste the URL.
8. Reply on the PR with the URL so README can be updated (or edit the **Staging URL** section).

**Railway:** New project from this repo (Dockerfile / `railway.json`). Set `AUTH_SECRET` and `STAGING_RESET_TOKEN` in the service variables. Set `DATABASE_URL=file:/app/data/staging.db` if you attach a volume at `/app/data`.

**Fly.io:** `fly launch --no-deploy` using `fly.toml` + `Dockerfile`, `fly secrets set AUTH_SECRET=… STAGING_RESET_TOKEN=…`, create a volume mounted at `/app/data`, then `fly deploy`. Replace the placeholder `app = "mediflow-staging"` with the name Fly assigns.

**Vercel:** GitHub integration works for Next.js (`vercel.json`), but a SQLite file **will not persist** across serverless invocations. Skip Vercel for this staging demo unless a hosted SQLite/Postgres (e.g. Turso/Neon) is added later. Do not deploy this app as production.

Do **not** deploy to a production domain. Staging only.

## Demo auth (M4)

Seed emails/passwords are unchanged (table above).

1. Open `/login`. Sign in as `patient@mediflow.demo` / `demo1234`. You land on **Lịch của tôi** with **Đặt lịch**. Header shows **Bệnh nhân**.
2. Open `/receptionist` as that patient → **Không có quyền truy cập**. `GET /api/receptionist/appointments` returns **403**.
3. Sign out. Click **Đăng nhập** again with the same email and a wrong password → **Email hoặc mật khẩu không đúng.**
4. Sign in as `receptionist@mediflow.demo` / `demo1234`. You land on **Lịch chờ xác nhận**. Header shows **Lễ tân**. `/book` redirects away from the patient booking form. `GET /api/appointments` returns **403**.
5. Sign out. The old session cookie cannot call `/api/auth/me` or other protected APIs (**401**). Signing in as the other role does not keep the previous session.

## Demo E2E (M1–M3)

Use the same database (do not reset between steps). On staging, `POST /api/staging/reset` first if slots are exhausted.

1. Sign in as `patient@mediflow.demo` / `demo1234`.
2. Open **Đặt lịch**, choose a doctor and an open slot, submit. Status **Chờ xác nhận (`pending`)**.
3. Sign out, then sign in as `receptionist@mediflow.demo` / `demo1234`.
4. On **Lịch chờ xác nhận**, click **Xác nhận**.
5. Sign in as the patient. **Lịch của tôi** shows **Đã xác nhận (`confirmed`)**.

Automated (local or staging):

```bash
npm run smoke
# or: BASE_URL=https://YOUR-STAGING-URL npm run smoke
```

## Tests

```bash
npm test
npm run lint
npm run build
```

Covers login success/failure, role guards (patient vs receptionist, pages + APIs), logout session invalidation, booking (pending, validation, double-book 409), receptionist pending list, confirm/reject (including 409 already-decided and patient 403), and staging seed/reset authorization. Latest local/CI command results: see `TEST_REPORT.md`.

CI runs `npm test`, `npm run lint`, `npm run build`, then starts `npm run staging:start` and runs `npm run smoke` against `http://127.0.0.1:3000`. There is **no live staging URL** in this repo.

Local smoke (same as CI):

```bash
cp .env.example .env
npm run build
DATABASE_URL=file:./smoke.db STAGING_RESET_TOKEN=local-staging-reset SEED_ON_START=if-empty PORT=3000 HOSTNAME=127.0.0.1 npm run staging:start
# other terminal:
BASE_URL=http://127.0.0.1:3000 STAGING_RESET_TOKEN=local-staging-reset npm run smoke
```

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Dev server |
| `npm run setup` | Generate client + push schema + seed |
| `npm run db:seed` | Re-seed demo clinic/users/slots |
| `npm run db:reset` | Wipe SQLite DB and re-seed |
| `npm run staging:start` | `db push`, seed if empty, `next start` (0.0.0.0 / `$PORT`) |
| `npm run smoke` | HTTP E2E: health, reset auth, login/roles/logout, book → confirm/reject |
| `npm test` | Vitest (auth, booking, receptionist, staging) |
| `npm run build` / `npm start` | Production server |

## Environment

See `.env.example` (demo values only):

- `DATABASE_URL` — SQLite file (default `file:./dev.db` → `prisma/dev.db`)
- `AUTH_SECRET` — cookie signing key. The example value is a **demo** key. Hosts must generate their own (Render `generateValue`). Never commit production secrets.
- `STAGING_RESET_TOKEN` — optional; enables `POST /api/staging/reset`
- `SEED_ON_START` — `if-empty` (default) \| `always` \| `never`
- `PORT` / `HOSTNAME` — used by `staging:start`

## Out of scope (this PR)

Prescriptions, SMS, multi-clinic, production deploy. Live staging hostname is still waiting on Brian (M5 config is on `main`).

## Follow-ups

- **Brian** — connect Render (or Railway/Fly), paste the real staging URL into this README + the PR
