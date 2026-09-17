# MediFlow

Private-clinic appointment booking (pilot: 1 clinic). Sprint 1 Must **M1**: a logged-in patient can request an appointment.

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
| `patient@mediflow.demo` | Patient (use this for M1) |
| `patient2@mediflow.demo` | Second patient (double-booking check) |
| `receptionist@mediflow.demo` | Receptionist (M2/M3 later; login works, confirm UI is not built) |

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

## Tests

```bash
npm test
```

Covers the book-appointment path: happy path (`pending` + slot consumed), missing phone, missing slot, double-booking, receptionist cannot book.

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
| `npm test` | Vitest (booking + phone validation) |
| `npm run build` / `npm start` | Production server |

## Environment

See `.env.example`:

- `DATABASE_URL` — SQLite file (default `file:./dev.db`, stored as `prisma/dev.db`)
- `AUTH_SECRET` — demo signing key (change if you deploy)

## Out of scope (this PR)

Full receptionist confirm/reject (M2/M3), richer auth (M4), staging deploy (M5), prescriptions, SMS, multi-clinic.

## Follow-ups (M2–M5)

- **M2** — Receptionist pending-appointment list for the pilot clinic
- **M3** — Confirm / reject with reason; patient sees the new status
- **M4** — Tighten role checks (patient vs receptionist) and logout session invalidation coverage
- **M5** — Staging URL + documented seed/reset on that environment
