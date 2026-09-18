import type { PrismaClient } from "@prisma/client";
import { assertReceptionist, type SessionUser } from "./auth";
import {
  getPilotClinic,
  listPendingAppointmentsForClinic,
} from "./booking";
import { prisma } from "./prisma";

export async function loadReceptionistPendingList(
  session: SessionUser | null,
  client: PrismaClient = prisma,
) {
  assertReceptionist(session);
  const clinic = await getPilotClinic(client);
  const appointments = await listPendingAppointmentsForClinic(clinic.id, client);
  return { clinic, appointments };
}
