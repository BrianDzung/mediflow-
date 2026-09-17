# MediFlow

Private-clinic appointment booking (pilot: 1 clinic). Sprint 1 Must **M1–M2**: a logged-in patient can request an appointment; a receptionist can view pending bookings for the pilot clinic.

Vietnamese UI labels; code and comments in English.

## Stack

- Next.js (App Router) + TypeScript
- SQLite via Prisma (no Docker)
- Cookie session (signed JWT)

## Setup

```bash
cp .env.example .env
npm install
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run setup` generates the Prisma client, creates `prisma/dev.db`, and loads seed data.

Reset demo data anytime:

```bash
npm run db:reset
```

## Seed credentials

Password for all demo users: `demo1234`

| Email | Role |
|-------|------|
| `patient@mediflow.demo` | Patient (M1 booking) |
| `patient2@mediflow.demo` | Second patient (double-booking check) |
| `receptionist@mediflow.demo` | Receptionist (M2 pending list) |

Seed also includes **1 clinic**, **2 doctors**, and **8 open slots**.

These passwords are for local/demo only. Do not use production secrets in this repo.

## Demo M1 (patient booking request)

1. Sign in as `patient@mediflow.demo` / `demo1234`.
2. Open **Đặt lịch** (or click **Đặt lịch khám**).
3. Choose a doctor and an open slot.
4. Confirm name + phone (pre-filled from the seed user) and submit.
5. You should see status **Chờ xác nhận (`pending`)**.
6. The same slot disappears from the open list. Log in as `patient2@mediflow.demo` to confirm it is no longer offered.
7. Validation: clear the phone field and submit → error, no new appointment. Submit without a slot → error.

## Demo M2 (receptionist pending list)

Use the same local/seed database as M1 (do not reset between the two steps).

1. Complete **Demo M1** so at least one `pending` booking exists.
2. Sign out, then sign in as `receptionist@mediflow.demo` / `demo1234`.
3. You land on **Lịch chờ xác nhận** (`/receptionist`). The table lists pending appointments for the pilot clinic.
4. Each row shows **time, doctor, patient name, phone, and status**. The booking from step 1 appears.
5. Confirm/reject actions are **not** on this screen yet (M3).
6. Sign out and sign in as `patient@mediflow.demo`. Opening `/receptionist` shows **Không có quyền truy cập** (no appointment rows). `GET /api/receptionist/appointments` as a patient returns **403**.

## Tests

```bash
npm test
```

Covers:

- Book-appointment path: happy path (`pending` + slot consumed), missing phone, missing slot, double-booking, receptionist cannot book
- Receptionist pending list: M1 booking appears with required columns, only `pending` of the pilot clinic, patient is forbidden, unauthenticated is rejected

```bash
npm run lint
npm run build
```

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Dev server |
| `npm run setup` | Generate client + push schema + seed |
| `npm run db:reset` | Wipe SQLite DB and re-seed |
| `npm test` | Vitest (booking + receptionist list + phone validation) |
| `npm run build` / `npm start` | Production server |

## Environment

See `.env.example`:

- `DATABASE_URL` — SQLite file (default `file:./dev.db`, stored as `prisma/dev.db`)
- `AUTH_SECRET` — demo signing key (change if you deploy)

## Out of scope (this PR)

Receptionist confirm/reject (M3), richer auth (M4), staging deploy (M5), prescriptions, SMS, multi-clinic.

## Follow-ups (M3–M5)

- **M3** — Confirm / reject with reason; patient sees the new status
- **M4** — Tighten role checks (patient vs receptionist) and logout session invalidation coverage
- **M5** — Staging URL + documented seed/reset on that environment
