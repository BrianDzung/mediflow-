import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PILOT_CLINIC_NAME } from "../src/lib/constants";
import { seedDatabase } from "../src/lib/seed-data";
import {
  authorizeStagingReset,
  getDemoInventory,
  resetDemoData,
} from "../src/lib/staging";

const prisma = new PrismaClient();
const originalResetToken = process.env.STAGING_RESET_TOKEN;

beforeEach(async () => {
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

describe("demo seed inventory", () => {
  it("includes 1 clinic, doctors, open slots, patient + receptionist", async () => {
    const inventory = await getDemoInventory(prisma);
    expect(inventory.clinicCount).toBe(1);
    expect(inventory.clinicName).toBe(PILOT_CLINIC_NAME);
    expect(inventory.doctorCount).toBeGreaterThanOrEqual(1);
    expect(inventory.openSlotCount).toBeGreaterThanOrEqual(1);
    expect(inventory.users.map((user) => user.email)).toEqual(
      expect.arrayContaining([
        "patient@mediflow.demo",
        "receptionist@mediflow.demo",
      ]),
    );
    expect(inventory.users.some((user) => user.role === "patient")).toBe(true);
    expect(inventory.users.some((user) => user.role === "receptionist")).toBe(true);
    expect(inventory.demoReady).toBe(true);
  });

  it("resetDemoData wipes appointments and restores open slots", async () => {
    await prisma.appointment.deleteMany();
    await prisma.slot.updateMany({ data: { status: "booked" } });

    const inventory = await resetDemoData(prisma);
    expect(inventory.demoReady).toBe(true);
    expect(inventory.openSlotCount).toBeGreaterThanOrEqual(1);
    expect(await prisma.appointment.count()).toBe(0);
  });
});

describe("authorizeStagingReset", () => {
  it("returns 404 when the reset token is not configured", () => {
    delete process.env.STAGING_RESET_TOKEN;
    const result = authorizeStagingReset({
      authorizationHeader: "Bearer anything",
    });
    expect(result).toMatchObject({ ok: false, status: 404, code: "DISABLED" });
  });

  it("rejects a missing or wrong token", () => {
    process.env.STAGING_RESET_TOKEN = "correct-token";
    expect(authorizeStagingReset({ authorizationHeader: null })).toMatchObject({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(
      authorizeStagingReset({ authorizationHeader: "Bearer wrong-token" }),
    ).toMatchObject({ ok: false, status: 401, code: "UNAUTHORIZED" });
  });

  it("accepts a matching Bearer or header token", () => {
    process.env.STAGING_RESET_TOKEN = "correct-token";
    expect(
      authorizeStagingReset({ authorizationHeader: "Bearer correct-token" }),
    ).toEqual({ ok: true });
    expect(
      authorizeStagingReset({ headerToken: "correct-token" }),
    ).toEqual({ ok: true });
  });
});
