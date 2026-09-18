#!/usr/bin/env node
/**
 * HTTP smoke for M5: health + optional reset + patient book → receptionist confirm
 * → patient sees confirmed.
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
  return sessionCookie(response);
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

  const patientCookie = await login(PATIENT_EMAIL, DEMO_PASSWORD);
  const doctorsResponse = await fetch(`${BASE_URL}/api/doctors`, {
    headers: { cookie: patientCookie },
  });
  const doctorsBody = await readJson(doctorsResponse);
  if (!doctorsResponse.ok || !doctorsBody.doctors?.length) {
    fail(`doctors ${doctorsResponse.status}: ${JSON.stringify(doctorsBody)}`);
  }
  const doctor = doctorsBody.doctors[0];

  const slotsResponse = await fetch(
    `${BASE_URL}/api/slots?doctorId=${encodeURIComponent(doctor.id)}`,
    { headers: { cookie: patientCookie } },
  );
  const slotsBody = await readJson(slotsResponse);
  if (!slotsResponse.ok || !slotsBody.slots?.length) {
    fail(`slots ${slotsResponse.status}: ${JSON.stringify(slotsBody)}`);
  }
  const slot = slotsBody.slots[0];

  const bookResponse = await fetch(`${BASE_URL}/api/appointments`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: patientCookie },
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

  const receptionistCookie = await login(RECEPTIONIST_EMAIL, DEMO_PASSWORD);
  const pendingResponse = await fetch(`${BASE_URL}/api/receptionist/appointments`, {
    headers: { cookie: receptionistCookie },
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
    headers: { "content-type": "application/json", cookie: receptionistCookie },
    body: JSON.stringify({ decision: "confirm" }),
  });
  const confirmBody = await readJson(confirmResponse);
  if (!confirmResponse.ok || confirmBody.appointment?.status !== "confirmed") {
    fail(`confirm ${confirmResponse.status}: ${JSON.stringify(confirmBody)}`);
  }
  console.log("confirmed", appointmentId);

  const patientCookieAgain = await login(PATIENT_EMAIL, DEMO_PASSWORD);
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

  console.log("SMOKE PASS: patient book → receptionist confirm → patient sees confirmed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
