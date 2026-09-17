import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed-data";
import { bookAppointment, BookingError, listOpenSlots } from "../src/lib/booking";

const prisma = new PrismaClient();

async function getPatient(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`missing seed user ${email}`);
  return user;
}

beforeEach(async () => {
  await seedDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bookAppointment", () => {
  it("creates a pending appointment and marks the slot booked", async () => {
    const patient = await getPatient("patient@mediflow.demo");
    const slot = await prisma.slot.findFirst({ where: { status: "open" } });
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

    expect(appointment.status).toBe("pending");
    expect(appointment.patientName).toBe("Nguyễn Thị Hoa");
    expect(appointment.patientPhone).toBe("0901234567");

    const updatedSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(updatedSlot?.status).toBe("booked");

    const remaining = await listOpenSlots(slot.doctorId, prisma);
    expect(remaining.map((item) => item.id)).not.toContain(slot.id);
  });

  it("rejects a missing phone number without creating a record", async () => {
    const patient = await getPatient("patient@mediflow.demo");
    const slot = await prisma.slot.findFirst({ where: { status: "open" } });
    if (!slot) throw new Error("expected seed slots");

    await expect(
      bookAppointment(
        {
          patientUserId: patient.id,
          slotId: slot.id,
          patientName: patient.name,
          patientPhone: "   ",
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", name: "BookingError" });

    expect(await prisma.appointment.count()).toBe(0);
    expect((await prisma.slot.findUnique({ where: { id: slot.id } }))?.status).toBe("open");
  });

  it("rejects a missing slot without creating a record", async () => {
    const patient = await getPatient("patient@mediflow.demo");

    await expect(
      bookAppointment(
        {
          patientUserId: patient.id,
          slotId: "",
          patientName: patient.name,
          patientPhone: "0901234567",
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(await prisma.appointment.count()).toBe(0);
  });

  it("prevents double-booking the same slot", async () => {
    const patient = await getPatient("patient@mediflow.demo");
    const other = await getPatient("patient2@mediflow.demo");
    const slot = await prisma.slot.findFirst({ where: { status: "open" } });
    if (!slot) throw new Error("expected seed slots");

    await bookAppointment(
      {
        patientUserId: patient.id,
        slotId: slot.id,
        patientName: patient.name,
        patientPhone: "0901234567",
      },
      prisma,
    );

    await expect(
      bookAppointment(
        {
          patientUserId: other.id,
          slotId: slot.id,
          patientName: other.name,
          patientPhone: "0912345678",
        },
        prisma,
      ),
    ).rejects.toBeInstanceOf(BookingError);

    expect(await prisma.appointment.count()).toBe(1);
    expect((await prisma.slot.findUnique({ where: { id: slot.id } }))?.status).toBe("booked");
  });

  it("does not allow a receptionist to book", async () => {
    const receptionist = await getPatient("receptionist@mediflow.demo");
    const slot = await prisma.slot.findFirst({ where: { status: "open" } });
    if (!slot) throw new Error("expected seed slots");

    await expect(
      bookAppointment(
        {
          patientUserId: receptionist.id,
          slotId: slot.id,
          patientName: receptionist.name,
          patientPhone: "0987654321",
        },
        prisma,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await prisma.appointment.count()).toBe(0);
  });
});
