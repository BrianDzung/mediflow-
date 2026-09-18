import { Prisma, type PrismaClient } from "@prisma/client";
import { PILOT_CLINIC_NAME } from "./constants";
import { prisma } from "./prisma";
import { isValidPhone, normalizePhone, trimRequired } from "./validation";

export type BookAppointmentInput = {
  patientUserId: string;
  slotId: string;
  patientName: string;
  patientPhone: string;
};

export class BookingError extends Error {
  constructor(
    public code: "VALIDATION" | "SLOT_TAKEN" | "SLOT_NOT_FOUND" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export async function bookAppointment(
  input: BookAppointmentInput,
  client: PrismaClient = prisma,
) {
  const patientName = trimRequired(input.patientName);
  const patientPhone = normalizePhone(trimRequired(input.patientPhone));
  const slotId = trimRequired(input.slotId);

  if (!patientName) {
    throw new BookingError("VALIDATION", "Vui lòng nhập họ tên.");
  }
  if (!patientPhone) {
    throw new BookingError("VALIDATION", "Vui lòng nhập số điện thoại.");
  }
  if (!isValidPhone(patientPhone)) {
    throw new BookingError(
      "VALIDATION",
      "Số điện thoại không hợp lệ (dùng 10 số, bắt đầu bằng 0).",
    );
  }
  if (!slotId) {
    throw new BookingError("VALIDATION", "Vui lòng chọn khung giờ.");
  }

  const patient = await client.user.findUnique({
    where: { id: input.patientUserId },
  });
  if (!patient || patient.role !== "patient") {
    throw new BookingError("FORBIDDEN", "Chỉ bệnh nhân mới được đặt lịch.");
  }

  try {
    return await client.$transaction(async (tx) => {
      const slot = await tx.slot.findUnique({
        where: { id: slotId },
        include: { doctor: true },
      });
      if (!slot) {
        throw new BookingError("SLOT_NOT_FOUND", "Khung giờ không tồn tại.");
      }
      if (slot.status !== "open") {
        throw new BookingError(
          "SLOT_TAKEN",
          "Khung giờ đã được đặt. Vui lòng chọn khung giờ khác.",
        );
      }

      const claimed = await tx.slot.updateMany({
        where: { id: slotId, status: "open" },
        data: { status: "booked" },
      });
      if (claimed.count !== 1) {
        throw new BookingError(
          "SLOT_TAKEN",
          "Khung giờ đã được đặt. Vui lòng chọn khung giờ khác.",
        );
      }

      const appointment = await tx.appointment.create({
        data: {
          slotId,
          patientUserId: patient.id,
          patientName,
          patientPhone,
          status: "pending",
        },
        include: {
          slot: { include: { doctor: true } },
        },
      });

      return appointment;
    });
  } catch (error) {
    if (error instanceof BookingError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BookingError(
        "SLOT_TAKEN",
        "Khung giờ đã được đặt. Vui lòng chọn khung giờ khác.",
      );
    }
    throw error;
  }
}

export async function listOpenSlots(doctorId: string, client: PrismaClient = prisma) {
  return client.slot.findMany({
    where: {
      doctorId,
      status: "open",
      startsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function listDoctors(client: PrismaClient = prisma) {
  return client.doctor.findMany({
    include: { clinic: true },
    orderBy: { name: "asc" },
  });
}

export async function listPatientAppointments(
  patientUserId: string,
  client: PrismaClient = prisma,
) {
  return client.appointment.findMany({
    where: { patientUserId },
    include: { slot: { include: { doctor: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPilotClinic(client: PrismaClient = prisma) {
  const clinic =
    (await client.clinic.findFirst({ where: { name: PILOT_CLINIC_NAME } })) ??
    (await client.clinic.findFirst());
  if (!clinic) {
    throw new BookingError("SLOT_NOT_FOUND", "Chưa có phòng khám demo.");
  }
  return clinic;
}

export async function listPendingAppointmentsForClinic(
  clinicId: string,
  client: PrismaClient = prisma,
) {
  return client.appointment.findMany({
    where: {
      status: "pending",
      slot: { doctor: { clinicId } },
    },
    include: {
      slot: { include: { doctor: { include: { clinic: true } } } },
    },
    orderBy: { slot: { startsAt: "asc" } },
  });
}

export type AppointmentView = {
  id: string;
  status: string;
  patientName: string;
  patientPhone: string;
  note?: string | null;
  createdAt: Date;
  slot: {
    startsAt: Date;
    endsAt: Date;
    doctor: { name: string; specialty: string; clinic?: { name: string } };
  };
};

export function serializeAppointment(appointment: AppointmentView) {
  return {
    id: appointment.id,
    status: appointment.status,
    patientName: appointment.patientName,
    patientPhone: appointment.patientPhone,
    note: appointment.note ?? null,
    createdAt: appointment.createdAt.toISOString(),
    doctorName: appointment.slot.doctor.name,
    doctorSpecialty: appointment.slot.doctor.specialty,
    clinicName: appointment.slot.doctor.clinic?.name ?? null,
    startsAt: appointment.slot.startsAt.toISOString(),
    endsAt: appointment.slot.endsAt.toISOString(),
  };
}
