# MediFlow MVP automation test report

Commands and pass counts below are from this PR’s local run. No live staging URL is used or invented.

## Commands

```bash
npm test
npm run lint
npm run build
```

HTTP smoke (same pattern as `.github/workflows/ci.yml`):

```bash
DATABASE_URL=file:./smoke.db \
  AUTH_SECRET=ci-demo-secret-not-for-production-use \
  STAGING_RESET_TOKEN=ci-staging-reset-token \
  SEED_ON_START=if-empty \
  PORT=3000 \
  HOSTNAME=127.0.0.1 \
  npm run staging:start

# then:
BASE_URL=http://127.0.0.1:3000 STAGING_RESET_TOKEN=ci-staging-reset-token npm run smoke
```

There is no public staging hostname in this environment. CI on the PR runs the same smoke against local `staging:start`.

## Results

_Filled after the local run on this branch. Do not treat empty rows as pass._

| Command | Result | Notes |
|---------|--------|-------|
| `npm test` | pending | Vitest |
| `npm run lint` | pending | ESLint |
| `npm run build` | pending | `next build` |
| `npm run smoke` vs local `staging:start` | pending | HTTP E2E |

## Coverage added or tightened in this PR

| Area | What is asserted |
|------|------------------|
| Auth | Login success/fail; empty credentials 400; tampered/garbage token; expired DB session; logout revokes server session (`/api/auth/me` → 401 with old cookie) |
| Role guards | Page helpers (existing) plus HTTP 401/403 on patient vs receptionist APIs |
| M1 | Pending booking; missing name/phone/slot; invalid phone; double-book `SLOT_TAKEN` 409 |
| M2 | Receptionist pending list; patient forbidden (lib + HTTP) |
| M3 | Confirm → `confirmed`; reject + reason → `rejected`; patient sees status; already-decided 409; patient confirm 403 |
| M5 | `/api/health` inventory (no secrets); `/api/staging/reset` 404 when disabled, 401 without/wrong token, 200 with token |

Existing Vitest files still cover lib-level M1–M5. Smoke now also hits reset-auth, validation, double-book 409, confirm 409, and reject.
