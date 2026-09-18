# MediFlow MVP automation test report

Recorded from this PR branch (`cursor/strengthen-mvp-automation-tests-30a2`) on 2026-09-18 in the Cloud Agent workspace. **No live staging URL** was used or invented.

## Commands and results

| Command | Result | Notes |
|---------|--------|-------|
| `npm test` | **pass** | Vitest **44/44** tests, **7/7** files, **0** failed (~15s) |
| `npm run lint` | **pass** | ESLint **0** errors, **0** warnings (45 files scanned) |
| `npm run build` | **pass** | `next build` compiled; TypeScript finished |
| `npm run smoke` vs local `staging:start` | **pass** | See smoke log below |

### Vitest by file

| File | Tests | Status |
|------|-------|--------|
| `tests/auth.test.ts` | 12 | passed |
| `tests/booking.test.ts` | 7 | passed |
| `tests/http-routes.test.ts` | 7 | passed |
| `tests/receptionist-decision.test.ts` | 7 | passed |
| `tests/receptionist-pending.test.ts` | 4 | passed |
| `tests/staging.test.ts` | 5 | passed |
| `tests/validation.test.ts` | 2 | passed |
| **Total** | **44** | **passed** |

### Smoke (local `staging:start`)

Server:

```bash
DATABASE_URL=file:./smoke.db \
  AUTH_SECRET=ci-demo-secret-not-for-production-use \
  STAGING_RESET_TOKEN=ci-staging-reset-token \
  SEED_ON_START=if-empty \
  PORT=3000 \
  HOSTNAME=127.0.0.1 \
  npm run staging:start
```

Then:

```bash
BASE_URL=http://127.0.0.1:3000 STAGING_RESET_TOKEN=ci-staging-reset-token npm run smoke
```

Script output (abridged): `health ok` (1 clinic, 2 doctors, 8 open slots) → reset without/wrong token **401**, reset with token **ok** → login failure **ok** → role guards **ok** → logout invalidates session **ok** → book pending → validation + double-book **409 ok** → confirm → confirm-again **409** → patient sees **confirmed** → reject + patient sees **rejected ok**.

Final line: `SMOKE PASS: login/roles/logout/reset-auth + book/validate/409 + confirm/reject/409 + patient status`

CI on this PR runs the same `staging:start` + `npm run smoke` sequence (plus `npm test`, `npm run lint`, `npm run build`). There is still **no public staging hostname** in this repo.

## Coverage this PR tightened

| Area | What is asserted |
|------|------------------|
| Auth | Login success/fail; empty credentials 400; tampered/garbage token; expired DB session; logout revokes server session (`/api/auth/me` → 401 with old cookie) |
| Role guards | Page helpers (existing) plus HTTP 401/403 on patient vs receptionist APIs |
| M1 | Pending booking; missing name/phone/slot; invalid phone; double-book `SLOT_TAKEN` 409 |
| M2 | Receptionist pending list; patient forbidden (lib + HTTP) |
| M3 | Confirm → `confirmed`; reject + reason → `rejected`; patient sees status; already-decided 409; patient confirm 403 |
| M5 | `/api/health` inventory (no secrets); `/api/staging/reset` 404 when disabled, 401 without/wrong token, 200 with token |
