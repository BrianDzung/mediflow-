import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PILOT_CLINIC_NAME } from "./constants";
import { prisma } from "./prisma";
import { seedDatabase } from "./seed-data";

export type StagingAuthResult =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

export function getConfiguredResetToken() {
  return process.env.STAGING_RESET_TOKEN?.trim() ?? "";
}

export function resetEndpointEnabled() {
  return getConfiguredResetToken().length > 0;
}

function parseBearerToken(authorizationHeader: string | null | undefined) {
  if (!authorizationHeader) return "";
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match?.[1]?.trim() ?? "";
}

function safeEqual(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Authorize POST /api/staging/reset. Disabled when STAGING_RESET_TOKEN is unset. */
export function authorizeStagingReset(input: {
  authorizationHeader?: string | null;
  headerToken?: string | null;
}): StagingAuthResult {
  const expected = getConfiguredResetToken();
  if (!expected) {
    return {
      ok: false,
      status: 404,
      code: "DISABLED",
      error: "Reset demo không được bật trên môi trường này.",
    };
  }

  const provided =
    parseBearerToken(input.authorizationHeader) || (input.headerToken ?? "").trim();
  if (!provided || !safeEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Token reset không hợp lệ.",
    };
  }

  return { ok: true };
}

export async function getDemoInventory(client: PrismaClient = prisma) {
  const [clinicCount, doctorCount, openSlotCount, users, clinic] = await Promise.all([
    client.clinic.count(),
    client.doctor.count(),
    client.slot.count({
      where: { status: "open", startsAt: { gte: new Date() } },
    }),
    client.user.findMany({
      select: { email: true, role: true },
      orderBy: { email: "asc" },
    }),
    client.clinic.findFirst({ where: { name: PILOT_CLINIC_NAME } }),
  ]);

  const patientEmails = users.filter((user) => user.role === "patient").map((user) => user.email);
  const receptionistEmails = users
    .filter((user) => user.role === "receptionist")
    .map((user) => user.email);

  return {
    clinicCount,
    clinicName: clinic?.name ?? null,
    doctorCount,
    openSlotCount,
    users,
    demoReady:
      clinicCount >= 1 &&
      doctorCount >= 1 &&
      openSlotCount >= 1 &&
      patientEmails.length >= 1 &&
      receptionistEmails.length >= 1,
    resetEnabled: resetEndpointEnabled(),
  };
}

export async function resetDemoData(client: PrismaClient = prisma) {
  await seedDatabase(client);
  return getDemoInventory(client);
}
