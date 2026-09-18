import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthGet } from "../src/app/api/health/route";
import { POST as resetPost } from "../src/app/api/staging/reset/route";
import { POST as loginPost } from "../src/app/api/auth/login/route";
import { POST as logoutPost } from "../src/app/api/auth/logout/route";
import { GET as meGet } from "../src/app/api/auth/me/route";
import { GET as appointmentsGet, POST as appointmentsPost } from "../src/app/api/appointments/route";
import { GET as receptionistPendingGet } from "../src/app/api/receptionist/appointments/route";
import { POST as receptionistDecisionPost } from "../src/app/api/receptionist/appointments/[id]/route";
import { SESSION_COOKIE } from "../src/lib/auth";
import { PILOT_CLINIC_NAME } from "../src/lib/constants";
import { prisma } from "../src/lib/prisma";
import { DEMO_PASSWORD, seedDatabase } from "../src/lib/seed-data";
import { readJson, sessionTokenFromResponse } from "./helpers";

const { cookieJar } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

const originalResetToken = process.env.STAGING_RESET_TOKEN;

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loginAs(email: string, password = DEMO_PASSWORD) {
  const response = await loginPost(
    jsonRequest("http://localhost/api/auth/login", { email, password }),
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(`login failed ${response.status}: ${JSON.stringify(body)}`);
  }
  const token = sessionTokenFromResponse(response);
  cookieJar.set(SESSION_COOKIE, token);
  return { response, body, token };
}

beforeEach(async () => {
  cookieJar.clear();
  await seedDatabase(prisma);
});

afterEach(() => {
  if (originalResetToken === undefined) {
    delete process.env.STAGING_RESET_TOKEN;
  } else {
    process.env.STAGING_RESET_TOKEN = originalResetToken;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth HTTP routes", () => {
  it("logs in with seed credentials and rejects empty or wrong passwords", async () => {
    const missing = await loginPost(
      jsonRequest("http://localhost/api/auth/login", { email: "", password: "" }),
    );
    expect(missing.status).toBe(400);
    expect(await readJson(missing)).toMatchObject({ code: "VALIDATION" });

    const wrong = await loginPost(
      jsonRequest("http://localhost/api/auth/login", {
        email: "patient@mediflow.demo",
        password: "wrong-password",
      }),
    );
    expect(wrong.status).toBe(401);
    expect(await readJson(wrong)).toMatchObject({
      code: "INVALID_CREDENTIALS",
      error: "Email hoặc mật khẩu không đúng.",
    });

    const ok = await loginAs("patient@mediflow.demo");
    expect(ok.response.status).toBe(200);
    expect(ok.body.user).toMatchObject({
      email: "patient@mediflow.demo",
      role: "patient",
    });

    const me = await meGet();
    expect(me.status).toBe(200);
    expect(await readJson(me)).toMatchObject({
      user: { email: "patient@mediflow.demo", role: "patient" },
    });
  });

  it("logout revokes the server session so the old cookie cannot call /api/auth/me", async () => {
    await loginAs("patient@mediflow.demo");
    expect((await meGet()).status).toBe(200);

    const logout = await logoutPost();
    expect(logout.status).toBe(200);
    expect(await readJson(logout)).toEqual({ ok: true });

    const setCookie = logout.headers.getSetCookie().find((line) =>
      line.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(setCookie).toMatch(/Max-Age=0/i);

    expect((await meGet()).status).toBe(401);
    expect(await readJson(await meGet())).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("role guards on HTTP APIs", () => {
  it("returns 401 without a session and 403 across patient/receptionist APIs", async () => {
    expect((await appointmentsGet()).status).toBe(401);
    expect((await receptionistPendingGet()).status).toBe(401);

    await loginAs("patient@mediflow.demo");
    const patientPending = await receptionistPendingGet();
    expect(patientPending.status).toBe(403);
    expect(await readJson(patientPending)).toMatchObject({ code: "FORBIDDEN" });

    cookieJar.clear();
    await loginAs("receptionist@mediflow.demo");
    const receptionistMine = await appointmentsGet();
    expect(receptionistMine.status).toBe(403);
    expect(await readJson(receptionistMine)).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("M1–M3 HTTP booking and decision", () => {
  it("patient books pending, double-book is 409, receptionist confirms, second decide is 409", async () => {
    await loginAs("patient@mediflow.demo");
    const slot = await prisma.slot.findFirst({
      where: { status: "open" },
      orderBy: { startsAt: "asc" },
    });
    if (!slot) throw new Error("expected seed slots");

    const booked = await appointmentsPost(
      jsonRequest("http://localhost/api/appointments", {
        slotId: slot.id,
        patientName: "Nguyễn Thị Hoa",
        patientPhone: "0901234567",
      }),
    );
    expect(booked.status).toBe(201);
    const bookedBody = await readJson(booked);
    const appointment = bookedBody.appointment as { id: string; status: string };
    expect(appointment.status).toBe("pending");

    const doubleBook = await appointmentsPost(
      jsonRequest("http://localhost/api/appointments", {
        slotId: slot.id,
        patientName: "Lê Văn Nam",
        patientPhone: "0912345678",
      }),
    );
    expect(doubleBook.status).toBe(409);
    expect(await readJson(doubleBook)).toMatchObject({ code: "SLOT_TAKEN" });

    const patientConfirm = await receptionistDecisionPost(
      jsonRequest("http://localhost/api/receptionist/appointments/x", {
        decision: "confirm",
      }),
      { params: Promise.resolve({ id: appointment.id }) },
    );
    expect(patientConfirm.status).toBe(403);

    cookieJar.clear();
    await loginAs("receptionist@mediflow.demo");
    const pending = await receptionistPendingGet();
    expect(pending.status).toBe(200);
    const pendingBody = await readJson(pending);
    expect(pendingBody.clinic).toMatchObject({ name: PILOT_CLINIC_NAME });
    expect(
      (pendingBody.appointments as Array<{ id: string }>).some((row) => row.id === appointment.id),
    ).toBe(true);

    const confirm = await receptionistDecisionPost(
      jsonRequest("http://localhost/api/receptionist/appointments/x", {
        decision: "confirm",
      }),
      { params: Promise.resolve({ id: appointment.id }) },
    );
    expect(confirm.status).toBe(200);
    expect(await readJson(confirm)).toMatchObject({
      appointment: { id: appointment.id, status: "confirmed" },
    });

    const confirmAgain = await receptionistDecisionPost(
      jsonRequest("http://localhost/api/receptionist/appointments/x", {
        decision: "confirm",
      }),
      { params: Promise.resolve({ id: appointment.id }) },
    );
    expect(confirmAgain.status).toBe(409);
    expect(await readJson(confirmAgain)).toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("receptionist rejects with a reason and the patient sees rejected", async () => {
    await loginAs("patient@mediflow.demo");
    const slot = await prisma.slot.findFirst({
      where: { status: "open" },
      orderBy: { startsAt: "asc" },
    });
    if (!slot) throw new Error("expected seed slots");

    const booked = await appointmentsPost(
      jsonRequest("http://localhost/api/appointments", {
        slotId: slot.id,
        patientName: "Nguyễn Thị Hoa",
        patientPhone: "0901234567",
      }),
    );
    const appointment = (await readJson(booked)).appointment as { id: string };

    cookieJar.clear();
    await loginAs("receptionist@mediflow.demo");
    const rejected = await receptionistDecisionPost(
      jsonRequest("http://localhost/api/receptionist/appointments/x", {
        decision: "reject",
        reason: "Bác sĩ bận vào khung giờ này",
      }),
      { params: Promise.resolve({ id: appointment.id }) },
    );
    expect(rejected.status).toBe(200);
    expect(await readJson(rejected)).toMatchObject({
      appointment: { id: appointment.id, status: "rejected", note: "Bác sĩ bận vào khung giờ này" },
    });

    cookieJar.clear();
    await loginAs("patient@mediflow.demo");
    const mine = await appointmentsGet();
    expect(mine.status).toBe(200);
    const mineBody = await readJson(mine);
    expect(mineBody.appointments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: appointment.id,
          status: "rejected",
          note: "Bác sĩ bận vào khung giờ này",
        }),
      ]),
    );
  });
});

describe("M5 health and staging reset HTTP", () => {
  it("GET /api/health reports demo inventory without secrets", async () => {
    const response = await healthGet();
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body).toMatchObject({
      ok: true,
      service: "mediflow",
      clinicCount: 1,
      clinicName: PILOT_CLINIC_NAME,
      demoReady: true,
    });
    expect(body.doctorCount).toBeGreaterThanOrEqual(2);
    expect(body.openSlotCount).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toMatch(/demo1234|passwordHash|AUTH_SECRET/i);
  });

  it("POST /api/staging/reset requires the configured token", async () => {
    delete process.env.STAGING_RESET_TOKEN;
    const disabled = await resetPost(new Request("http://localhost/api/staging/reset", { method: "POST" }));
    expect(disabled.status).toBe(404);
    expect(await readJson(disabled)).toMatchObject({ code: "DISABLED" });

    process.env.STAGING_RESET_TOKEN = "correct-token";
    const missing = await resetPost(new Request("http://localhost/api/staging/reset", { method: "POST" }));
    expect(missing.status).toBe(401);
    expect(await readJson(missing)).toMatchObject({ code: "UNAUTHORIZED" });

    const wrong = await resetPost(
      new Request("http://localhost/api/staging/reset", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
      }),
    );
    expect(wrong.status).toBe(401);

    const ok = await resetPost(
      new Request("http://localhost/api/staging/reset", {
        method: "POST",
        headers: { authorization: "Bearer correct-token" },
      }),
    );
    expect(ok.status).toBe(200);
    expect(await readJson(ok)).toMatchObject({ ok: true, demoReady: true });
  });
});
