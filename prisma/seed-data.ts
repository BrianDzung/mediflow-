import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PILOT_CLINIC_NAME } from "../src/lib/constants";

export const DEMO_PASSWORD = "demo1234";

function slotAt(daysFromNow: number, hourUtc: number, minute: number) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + daysFromNow);
  start.setUTCHours(hourUtc, minute, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { startsAt: start, endsAt: end };
}

export async function seedDatabase(client: PrismaClient) {
  await client.appointment.deleteMany();
  await client.slot.deleteMany();
  await client.doctor.deleteMany();
  await client.user.deleteMany();
  await client.clinic.deleteMany();

  const clinic = await client.clinic.create({
    data: { name: PILOT_CLINIC_NAME },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await client.user.createMany({
    data: [
      {
        email: "patient@mediflow.demo",
        passwordHash,
        role: "patient",
        name: "Nguyễn Thị Hoa",
        phone: "0901234567",
      },
      {
        email: "patient2@mediflow.demo",
        passwordHash,
        role: "patient",
        name: "Lê Văn Nam",
        phone: "0912345678",
      },
      {
        email: "receptionist@mediflow.demo",
        passwordHash,
        role: "receptionist",
        name: "Phạm Thị Lan",
        phone: "0987654321",
      },
    ],
  });

  const internist = await client.doctor.create({
    data: {
      clinicId: clinic.id,
      name: "BS. Nguyễn Văn An",
      specialty: "Nội tổng quát",
    },
  });

  const pediatrician = await client.doctor.create({
    data: {
      clinicId: clinic.id,
      name: "BS. Trần Thị Bình",
      specialty: "Nhi khoa",
    },
  });

  const slotSpecs = [
    { doctorId: internist.id, days: 1, hour: 1, minute: 0 },
    { doctorId: internist.id, days: 1, hour: 1, minute: 30 },
    { doctorId: internist.id, days: 1, hour: 2, minute: 0 },
    { doctorId: internist.id, days: 1, hour: 2, minute: 30 },
    { doctorId: pediatrician.id, days: 1, hour: 3, minute: 0 },
    { doctorId: pediatrician.id, days: 1, hour: 3, minute: 30 },
    { doctorId: pediatrician.id, days: 2, hour: 1, minute: 0 },
    { doctorId: pediatrician.id, days: 2, hour: 1, minute: 30 },
  ];

  await client.slot.createMany({
    data: slotSpecs.map((spec) => ({
      doctorId: spec.doctorId,
      status: "open",
      ...slotAt(spec.days, spec.hour, spec.minute),
    })),
  });

  return { clinicId: clinic.id };
}
