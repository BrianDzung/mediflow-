import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../src/lib/seed-data";
import { AuthError, type SessionUser } from "../src/lib/auth";
import { PILOT_CLINIC_NAME } from "../src/lib/constants";
import { bookAppointment } from "../src/lib/booking";
import { loadReceptionistPendingList } from "../src/lib/receptionist";

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

beforeEach(async () => {
  await seedDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("receptionist pending list", () => {
  it("shows a booking created via M1 with time, doctor, patient, phone, and pending status", async () => {
    const patient = await getUser("patient@mediflow.demo");
    const receptionist = await getUser("receptionist@mediflow.demo");
    const slot = await prisma.slot.findFirst({
      where: { status: "open" },
      include: { doctor: true },
    });
    if (!slot) throw new Error("expected seed slots");

    const booked = await bookAppointment(
      {
        patientUserId: patient.id,
        slotId: slot.id,
        patientName: patient.name,
        patientPhone: patient.phone ?? "",
      },
      prisma,
    );

    const { clinic, appointments } = await loadReceptionistPendingList(
      asSession(receptionist),
      prisma,
    );

    expect(clinic.name).toBe(PILOT_CLINIC_NAME);
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).toMatchObject({
      id: booked.id,
      status: "pending",
      patientName: "Nguyễn Thị Hoa",
      patientPhone: "0901234567",
    });
    expect(appointments[0].slot.doctor.name).toBe(slot.doctor.name);
    expect(appointments[0].slot.startsAt.toISOString()).toBe(slot.startsAt.toISOString());
    expect(appointments[0].slot.endsAt.toISOString()).toBe(slot.endsAt.toISOString());
  });

  it("defaults to pending appointments for the pilot clinic only", async () => {
    const patient = await getUser("patient@mediflow.demo");
    const other = await getUser("patient2@mediflow.demo");
    const receptionist = await getUser("receptionist@mediflow.demo");
    const slots = await prisma.slot.findMany({
      where: { status: "open" },
      include: { doctor: true },
      orderBy: { startsAt: "asc" },
    });
    if (slots.length < 2) throw new Error("expected multiple seed slots");

    const pending = await bookAppointment(
      {
        patientUserId: patient.id,
        slotId: slots[0].id,
        patientName: patient.name,
        patientPhone: "0901234567",
      },
      prisma,
    );

    const confirmed = await bookAppointment(
      {
        patientUserId: other.id,
        slotId: slots[1].id,
        patientName: other.name,
        patientPhone: "0912345678",
      },
      prisma,
    );
    await prisma.appointment.update({
      where: { id: confirmed.id },
      data: { status: "confirmed" },
    });

    const otherClinic = await prisma.clinic.create({
      data: { name: "Phòng khám khác (ngoài pilot)" },
    });
    const otherDoctor = await prisma.doctor.create({
      data: {
        clinicId: otherClinic.id,
        name: "BS. Ngoài Pilot",
        specialty: "Da liễu",
      },
    });
    const otherSlot = await prisma.slot.create({
      data: {
        doctorId: otherDoctor.id,
        status: "open",
        startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      },
    });
    await bookAppointment(
      {
        patientUserId: patient.id,
        slotId: otherSlot.id,
        patientName: patient.name,
        patientPhone: "0901234567",
      },
      prisma,
    );

    const { appointments } = await loadReceptionistPendingList(
      asSession(receptionist),
      prisma,
    );

    expect(appointments.map((item) => item.id)).toEqual([pending.id]);
    expect(appointments.every((item) => item.status === "pending")).toBe(true);
    expect(appointments.every((item) => item.slot.doctor.clinicId === slots[0].doctor.clinicId)).toBe(true);
  });

  it("forbids a patient from loading the receptionist pending list", async () => {
    const patient = await getUser("patient@mediflow.demo");

    await expect(loadReceptionistPendingList(asSession(patient), prisma)).rejects.toMatchObject({
      name: "AuthError",
      code: "FORBIDDEN",
    });
    await expect(loadReceptionistPendingList(asSession(patient), prisma)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(loadReceptionistPendingList(null, prisma)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
