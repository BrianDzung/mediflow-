import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "../src/lib/auth";
import { bookAppointment } from "../src/lib/booking";

export async function getSeedUser(client: PrismaClient, email: string) {
  const user = await client.user.findUnique({ where: { email } });
  if (!user) throw new Error(`missing seed user ${email}`);
  return user;
}

export function asSession(user: {
  id: string;
  email: string;
  role: string;
  name: string;
  phone: string | null;
}): SessionUser {
  if (user.role !== "patient" && user.role !== "receptionist") {
    throw new Error(`unexpected role ${user.role}`);
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone,
  };
}

export async function bookOpenSlot(client: PrismaClient, email: string) {
  const patient = await getSeedUser(client, email);
  const slot = await client.slot.findFirst({
    where: { status: "open" },
    orderBy: { startsAt: "asc" },
  });
  if (!slot) throw new Error("expected seed slots");
  const appointment = await bookAppointment(
    {
      patientUserId: patient.id,
      slotId: slot.id,
      patientName: patient.name,
      patientPhone: patient.phone ?? "",
    },
    client,
  );
  return { patient, slot, appointment };
}

export async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

export function sessionTokenFromResponse(response: Response): string {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const line = cookies.find((cookie) => cookie.startsWith("mediflow_session="));
  if (!line) {
    throw new Error(`missing mediflow_session cookie (got: ${cookies.join(" | ") || "none"})`);
  }
  return line.split(";")[0].slice("mediflow_session=".length);
}
