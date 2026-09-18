import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../src/lib/seed-data";
import { AuthError, type SessionUser } from "../src/lib/auth";
import { bookAppointment, listPatientAppointments } from "../src/lib/booking";
import {
  DecisionError,
  decideAppointment,
  decisionHttpStatus,
  runReceptionistDecision,
} from "../src/lib/receptionist";

const prisma = new PrismaClient();

async function getUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`missing seed user ${email}`);
  return user;
}

function asSession(user: {
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

async function bookOpenSlot(email: string) {
  const patient = await getUser(email);
  const slot = await prisma.slot.findFirst({
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
    prisma,
  );
  return { patient, appointment };
}

beforeEach(async () => {
  await seedDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("receptionist confirm/reject (M3)", () => {
  it("confirms a pending appointment (happy path)", async () => {
    const receptionist = await getUser("receptionist@mediflow.demo");
    const { appointment } = await bookOpenSlot("patient@mediflow.demo");

    const result = await runReceptionistDecision(
      asSession(receptionist),
      { appointmentId: appointment.id, decision: "confirm" },
      prisma,
    );

    expect(result.appointment.status).toBe("confirmed");
    expect(result.appointment.id).toBe(appointment.id);

    const stored = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(stored?.status).toBe("confirmed");
  });

  it("rejects a pending appointment with a reason", async () => {
    const receptionist = await getUser("receptionist@mediflow.demo");
    const { appointment } = await bookOpenSlot("patient@mediflow.demo");

    const result = await decideAppointment(
      asSession(receptionist),
      {
        appointmentId: appointment.id,
        decision: "reject",
        reason: "Bác sĩ bận vào khung giờ này",
      },
      prisma,
    );

    expect(result.status).toBe("rejected");
    expect(result.note).toBe("Bác sĩ bận vào khung giờ này");
  });

  it("rejects a whitespace-only or too-short reason without changing status", async () => {
    const receptionist = await getUser("receptionist@mediflow.demo");
    const { appointment } = await bookOpenSlot("patient@mediflow.demo");

    await expect(
      decideAppointment(
        asSession(receptionist),
        { appointmentId: appointment.id, decision: "reject", reason: "  " },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", name: "DecisionError" });

    await expect(
      decideAppointment(
        asSession(receptionist),
        { appointmentId: appointment.id, decision: "reject", reason: "no" },
        prisma,
      ),
    ).rejects.toBeInstanceOf(DecisionError);

    const stored = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(stored?.status).toBe("pending");
  });

  it("lets the patient see the updated status after confirm or reject", async () => {
    const receptionist = await getUser("receptionist@mediflow.demo");
    const confirmed = await bookOpenSlot("patient@mediflow.demo");
    const rejected = await bookOpenSlot("patient@mediflow.demo");

    await decideAppointment(
      asSession(receptionist),
      { appointmentId: confirmed.appointment.id, decision: "confirm" },
      prisma,
    );
    await decideAppointment(
      asSession(receptionist),
      {
        appointmentId: rejected.appointment.id,
        decision: "reject",
        reason: "Trùng lịch phòng khám",
      },
      prisma,
    );

    const mine = await listPatientAppointments(confirmed.patient.id, prisma);
    const confirmedView = mine.find((item) => item.id === confirmed.appointment.id);
    const rejectedView = mine.find((item) => item.id === rejected.appointment.id);

    expect(confirmedView?.status).toBe("confirmed");
    expect(rejectedView?.status).toBe("rejected");
    expect(rejectedView?.note).toBe("Trùng lịch phòng khám");
  });

  it("blocks confirm/reject again on a finished booking (API clear error)", async () => {
    const receptionist = await getUser("receptionist@mediflow.demo");
    const { appointment } = await bookOpenSlot("patient@mediflow.demo");

    await decideAppointment(
      asSession(receptionist),
      { appointmentId: appointment.id, decision: "confirm" },
      prisma,
    );

    await expect(
      decideAppointment(
        asSession(receptionist),
        { appointmentId: appointment.id, decision: "confirm" },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED", name: "DecisionError" });

    const confirmAgain = await decideAppointment(
      asSession(receptionist),
      { appointmentId: appointment.id, decision: "confirm" },
      prisma,
    ).catch((error: unknown) => error);
    expect(confirmAgain).toBeInstanceOf(DecisionError);
    expect(decisionHttpStatus(confirmAgain as DecisionError)).toBe(409);

    await expect(
      decideAppointment(
        asSession(receptionist),
        { appointmentId: appointment.id, decision: "reject", reason: "Đổi ý" },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });

    const stored = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(stored?.status).toBe("confirmed");
  });

  it("forbids a patient from calling the confirm API (403)", async () => {
    const patient = await getUser("patient@mediflow.demo");
    const { appointment } = await bookOpenSlot("patient@mediflow.demo");

    const error = await runReceptionistDecision(
      asSession(patient),
      { appointmentId: appointment.id, decision: "confirm" },
      prisma,
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ code: "FORBIDDEN" });
    expect(decisionHttpStatus(error as AuthError)).toBe(403);

    const stored = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(stored?.status).toBe("pending");
  });

  it("rejects an unauthenticated confirm call (401)", async () => {
    const { appointment } = await bookOpenSlot("patient@mediflow.demo");

    const error = await runReceptionistDecision(
      null,
      { appointmentId: appointment.id, decision: "confirm" },
      prisma,
    ).catch((err: unknown) => err);

    expect(error).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(decisionHttpStatus(error as AuthError)).toBe(401);
  });
});
