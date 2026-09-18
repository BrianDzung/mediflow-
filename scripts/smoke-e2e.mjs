#!/usr/bin/env node
/**
 * HTTP smoke: health + optional reset + M4 auth (login fail, role guards, logout)
 * + patient book → receptionist confirm → patient sees confirmed (M1–M3).
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/smoke-e2e.mjs
 *
 * If STAGING_RESET_TOKEN is set, the script resets demo data first.
 */

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const RESET_TOKEN = (process.env.STAGING_RESET_TOKEN || "").trim();
const PATIENT_EMAIL = "patient@mediflow.demo";
const RECEPTIONIST_EMAIL = "receptionist@mediflow.demo";
const DEMO_PASSWORD = "demo1234";

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    fail(`non-JSON ${response.status} from ${response.url}: ${text.slice(0, 400)}`);
  }
}

function sessionCookie(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const session = cookies.find((cookie) => cookie.startsWith("mediflow_session="));
  if (!session) {
    fail(`missing mediflow_session cookie (got: ${cookies.join(" | ") || "none"})`);
  }
  return session.split(";")[0];
}

async function login(email, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    fail(`login ${email} → ${response.status}: ${JSON.stringify(body)}`);
  }
  return { cookie: sessionCookie(response), user: body.user };
}

async function expectJson(path, options, expectedStatus, expectedCode) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await readJson(response);
  if (response.status !== expectedStatus) {
    fail(`${path} expected ${expectedStatus} got ${response.status}: ${JSON.stringify(body)}`);
  }
  if (expectedCode && body.code !== expectedCode) {
    fail(`${path} expected code ${expectedCode} got ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log(`Smoke E2E against ${BASE_URL}`);

  const healthResponse = await fetch(`${BASE_URL}/api/health`);
  const health = await readJson(healthResponse);
  if (!healthResponse.ok || health.ok !== true) {
    fail(`health ${healthResponse.status}: ${JSON.stringify(health)}`);
  }
  console.log("health ok", {
    clinicCount: health.clinicCount,
    doctorCount: health.doctorCount,
    openSlotCount: health.openSlotCount,
    resetEnabled: health.resetEnabled,
  });

  if (RESET_TOKEN) {
    await expectJson("/api/staging/reset", { method: "POST" }, 401, "UNAUTHORIZED");
    await expectJson(
      "/api/staging/reset",
      { method: "POST", headers: { authorization: "Bearer wrong-token" } },
      401,
      "UNAUTHORIZED",
    );
    const resetResponse = await fetch(`${BASE_URL}/api/staging/reset`, {
      method: "POST",
      headers: { authorization: `Bearer ${RESET_TOKEN}` },
    });
    const resetBody = await readJson(resetResponse);
    if (!resetResponse.ok) {
      fail(`reset ${resetResponse.status}: ${JSON.stringify(resetBody)}`);
    }
    console.log("reset ok", {
      clinicCount: resetBody.clinicCount,
      doctorCount: resetBody.doctorCount,
      openSlotCount: resetBody.openSlotCount,
    });
  } else {
    await expectJson("/api/staging/reset", { method: "POST" }, 404, "DISABLED");
    console.log("reset disabled (no STAGING_RESET_TOKEN) ok");
  }

  const inventoryResponse = await fetch(`${BASE_URL}/api/health`);
  const inventory = await readJson(inventoryResponse);
  if (inventory.clinicCount < 1) fail("expected ≥1 clinic after seed");
  if (inventory.doctorCount < 1) fail("expected ≥1 doctor after seed");
  if (inventory.openSlotCount < 1) fail("expected open slots after seed");
  const emails = (inventory.users ?? []).map((user) => user.email);
  if (!emails.includes(PATIENT_EMAIL)) fail(`missing ${PATIENT_EMAIL}`);
  if (!emails.includes(RECEPTIONIST_EMAIL)) fail(`missing ${RECEPTIONIST_EMAIL}`);
  if (inventory.clinicName) {
    console.log("clinic", inventory.clinicName);
  }

  const wrongLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: PATIENT_EMAIL, password: "wrong-password" }),
  });
  const wrongBody = await readJson(wrongLogin);
  if (wrongLogin.status !== 401) {
    fail(`wrong password expected 401 got ${wrongLogin.status}: ${JSON.stringify(wrongBody)}`);
  }
  if (!String(wrongBody.error ?? "").includes("mật khẩu")) {
    fail(`wrong password should show a clear error, got ${JSON.stringify(wrongBody)}`);
  }
  console.log("login failure ok");

  const { cookie: patientCookie, user: patientUser } = await login(PATIENT_EMAIL, DEMO_PASSWORD);
  if (patientUser?.role !== "patient") {
    fail(`expected patient role, got ${JSON.stringify(patientUser)}`);
  }
  await expectJson(
    "/api/receptionist/appointments",
    { headers: { cookie: patientCookie } },
    403,
    "FORBIDDEN",
  );

  const { cookie: receptionistCookie } = await login(RECEPTIONIST_EMAIL, DEMO_PASSWORD);
  await expectJson("/api/appointments", { headers: { cookie: receptionistCookie } }, 403, "FORBIDDEN");
  await expectJson("/api/doctors", { headers: { cookie: receptionistCookie } }, 403, "FORBIDDEN");
  await expectJson(
    "/api/appointments",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: receptionistCookie },
      body: JSON.stringify({
        slotId: "not-a-slot",
        patientName: "Phạm Thị Lan",
        patientPhone: "0987654321",
      }),
    },
    403,
    "FORBIDDEN",
  );
  console.log("role guards ok");

  const logoutResponse = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: patientCookie },
  });
  const logoutBody = await readJson(logoutResponse);
  if (!logoutResponse.ok || logoutBody.ok !== true) {
    fail(`logout ${logoutResponse.status}: ${JSON.stringify(logoutBody)}`);
  }
  await expectJson("/api/auth/me", { headers: { cookie: patientCookie } }, 401, "UNAUTHENTICATED");
  await expectJson("/api/appointments", { headers: { cookie: patientCookie } }, 401, "UNAUTHENTICATED");
  console.log("logout invalidates session ok");

  const { cookie: patientCookieFresh } = await login(PATIENT_EMAIL, DEMO_PASSWORD);
  const doctorsResponse = await fetch(`${BASE_URL}/api/doctors`, {
    headers: { cookie: patientCookieFresh },
  });
  const doctorsBody = await readJson(doctorsResponse);
  if (!doctorsResponse.ok || !doctorsBody.doctors?.length) {
    fail(`doctors ${doctorsResponse.status}: ${JSON.stringify(doctorsBody)}`);
  }
  const doctor = doctorsBody.doctors[0];

  const slotsResponse = await fetch(
    `${BASE_URL}/api/slots?doctorId=${encodeURIComponent(doctor.id)}`,
    { headers: { cookie: patientCookieFresh } },
  );
  const slotsBody = await readJson(slotsResponse);
  if (!slotsResponse.ok || !slotsBody.slots?.length) {
    fail(`slots ${slotsResponse.status}: ${JSON.stringify(slotsBody)}`);
  }
  const slot = slotsBody.slots[0];

  const bookResponse = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: patientCookieFresh },
    body: JSON.stringify({
      slotId: slot.id,
      patientName: "Nguyễn Thị Hoa",
      patientPhone: "0901234567",
    }),
  });
  const bookBody = await readJson(bookResponse);
  if (bookResponse.status !== 201 || bookBody.appointment?.status !== "pending") {
    fail(`book ${bookResponse.status}: ${JSON.stringify(bookBody)}`);
  }
  const appointmentId = bookBody.appointment.id;
  console.log("booked pending", appointmentId);

  const invalidBook = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: patientCookieFresh },
    body: JSON.stringify({
      slotId: slot.id,
      patientName: "Nguyễn Thị Hoa",
      patientPhone: "   ",
    }),
  });
  const invalidBookBody = await readJson(invalidBook);
  if (invalidBook.status !== 400 || invalidBookBody.code !== "VALIDATION") {
    fail(`invalid book expected 400 VALIDATION got ${invalidBook.status}: ${JSON.stringify(invalidBookBody)}`);
  }

  const doubleBook = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: patientCookieFresh },
    body: JSON.stringify({
      slotId: slot.id,
      patientName: "Lê Văn Nam",
      patientPhone: "0912345678",
    }),
  });
  const doubleBookBody = await readJson(doubleBook);
  if (doubleBook.status !== 409 || doubleBookBody.code !== "SLOT_TAKEN") {
    fail(`double-book expected 409 SLOT_TAKEN got ${doubleBook.status}: ${JSON.stringify(doubleBookBody)}`);
  }
  console.log("booking validation + double-book 409 ok");

  const patientConfirm = await fetch(`${BASE_URL}/api/receptionist/appointments/${appointmentId}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: patientCookieFresh },
    body: JSON.stringify({ decision: "confirm" }),
  });
  const patientConfirmBody = await readJson(patientConfirm);
  if (patientConfirm.status !== 403) {
    fail(`patient confirm expected 403 got ${patientConfirm.status}: ${JSON.stringify(patientConfirmBody)}`);
  }

  const { cookie: receptionistCookieFresh } = await login(RECEPTIONIST_EMAIL, DEMO_PASSWORD);
  const pendingResponse = await fetch(`${BASE_URL}/api/receptionist/appointments`, {
    headers: { cookie: receptionistCookieFresh },
  });
  const pendingBody = await readJson(pendingResponse);
  if (!pendingResponse.ok) {
    fail(`pending list ${pendingResponse.status}: ${JSON.stringify(pendingBody)}`);
  }
  const pendingRow = (pendingBody.appointments ?? []).find((row) => row.id === appointmentId);
  if (!pendingRow) {
    fail("booked appointment did not appear on the receptionist pending list");
  }

  const confirmResponse = await fetch(`${BASE_URL}/api/receptionist/appointments/${appointmentId}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: receptionistCookieFresh },
    body: JSON.stringify({ decision: "confirm" }),
  });
  const confirmBody = await readJson(confirmResponse);
  if (!confirmResponse.ok || confirmBody.appointment?.status !== "confirmed") {
    fail(`confirm ${confirmResponse.status}: ${JSON.stringify(confirmBody)}`);
  }
  console.log("confirmed", appointmentId);

  const confirmAgain = await fetch(`${BASE_URL}/api/receptionist/appointments/${appointmentId}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: receptionistCookieFresh },
    body: JSON.stringify({ decision: "confirm" }),
  });
  const confirmAgainBody = await readJson(confirmAgain);
  if (confirmAgain.status !== 409 || confirmAgainBody.code !== "ALREADY_DECIDED") {
    fail(
      `confirm-again expected 409 ALREADY_DECIDED got ${confirmAgain.status}: ${JSON.stringify(confirmAgainBody)}`,
    );
  }

  const { cookie: patientCookieAgain } = await login(PATIENT_EMAIL, DEMO_PASSWORD);
  const mineResponse = await fetch(`${BASE_URL}/api/appointments`, {
    headers: { cookie: patientCookieAgain },
  });
  const mineBody = await readJson(mineResponse);
  if (!mineResponse.ok) {
    fail(`patient appointments ${mineResponse.status}: ${JSON.stringify(mineBody)}`);
  }
  const mine = (mineBody.appointments ?? []).find((row) => row.id === appointmentId);
  if (!mine) fail("patient list is missing the confirmed appointment");
  if (mine.status !== "confirmed") fail(`expected confirmed, got ${mine.status}`);

  const slotsAgainResponse = await fetch(
    `${BASE_URL}/api/slots?doctorId=${encodeURIComponent(doctor.id)}`,
    { headers: { cookie: patientCookieAgain } },
  );
  const slotsAgainBody = await readJson(slotsAgainResponse);
  if (!slotsAgainResponse.ok || !slotsAgainBody.slots?.length) {
    fail(`slots for reject path ${slotsAgainResponse.status}: ${JSON.stringify(slotsAgainBody)}`);
  }
  const rejectSlot = slotsAgainBody.slots[0];
  const rejectBookResponse = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: patientCookieAgain },
    body: JSON.stringify({
      slotId: rejectSlot.id,
      patientName: "Nguyễn Thị Hoa",
      patientPhone: "0901234567",
    }),
  });
  const rejectBookBody = await readJson(rejectBookResponse);
  if (rejectBookResponse.status !== 201 || rejectBookBody.appointment?.status !== "pending") {
    fail(`reject-path book ${rejectBookResponse.status}: ${JSON.stringify(rejectBookBody)}`);
  }
  const rejectedId = rejectBookBody.appointment.id;
  const rejectResponse = await fetch(`${BASE_URL}/api/receptionist/appointments/${rejectedId}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: receptionistCookieFresh },
    body: JSON.stringify({ decision: "reject", reason: "Bác sĩ bận vào khung giờ này" }),
  });
  const rejectBody = await readJson(rejectResponse);
  if (!rejectResponse.ok || rejectBody.appointment?.status !== "rejected") {
    fail(`reject ${rejectResponse.status}: ${JSON.stringify(rejectBody)}`);
  }
  const mineAfterRejectResponse = await fetch(`${BASE_URL}/api/appointments`, {
    headers: { cookie: patientCookieAgain },
  });
  const mineAfterRejectBody = await readJson(mineAfterRejectResponse);
  const rejectedRow = (mineAfterRejectBody.appointments ?? []).find((row) => row.id === rejectedId);
  if (!rejectedRow || rejectedRow.status !== "rejected") {
    fail(`patient did not see rejected status: ${JSON.stringify(mineAfterRejectBody)}`);
  }
  if (rejectedRow.note !== "Bác sĩ bận vào khung giờ này") {
    fail(`patient did not see reject reason: ${JSON.stringify(rejectedRow)}`);
  }
  console.log("reject + patient sees rejected ok");

  console.log(
    "SMOKE PASS: login/roles/logout/reset-auth + book/validate/409 + confirm/reject/409 + patient status",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
