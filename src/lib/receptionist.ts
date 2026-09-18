import type { PrismaClient } from "@prisma/client";
import { assertReceptionist, type SessionUser } from "./auth";
import {
  getPilotClinic,
  listPendingAppointmentsForClinic,
  serializeAppointment,
} from "./booking";
import { MIN_REJECT_REASON_LENGTH } from "./constants";
import { prisma } from "./prisma";
import { trimRequired } from "./validation";

export type AppointmentDecision = "confirm" | "reject";

export class DecisionError extends Error {
  constructor(
    public code: "VALIDATION" | "NOT_FOUND" | "ALREADY_DECIDED",
    message: string,
  ) {
    super(message);
    this.name = "DecisionError";
  }
}

export async function loadReceptionistPendingList(
  session: SessionUser | null,
  client: PrismaClient = prisma,
) {
  assertReceptionist(session);
  const clinic = await getPilotClinic(client);
  const appointments = await listPendingAppointmentsForClinic(clinic.id, client);
  return { clinic, appointments };
}

const appointmentInclude = {
  slot: { include: { doctor: { include: { clinic: true } } } },
} as const;

export async function decideAppointment(
  session: SessionUser | null,
  input: {
    appointmentId: string;
    decision: string;
    reason?: string;
  },
  client: PrismaClient = prisma,
) {
  assertReceptionist(session, "Chỉ lễ tân mới xác nhận hoặc từ chối lịch.");

  const appointmentId = trimRequired(input.appointmentId);
  if (!appointmentId) {
    throw new DecisionError("VALIDATION", "Thiếu mã lịch hẹn.");
  }

  if (input.decision !== "confirm" && input.decision !== "reject") {
    throw new DecisionError("VALIDATION", "Quyết định không hợp lệ.");
  }
  const decision: AppointmentDecision = input.decision;

  let note: string | null | undefined;
  if (decision === "reject") {
    const reason = trimRequired(input.reason);
    if (reason.length < MIN_REJECT_REASON_LENGTH) {
      throw new DecisionError(
        "VALIDATION",
        `Vui lòng nhập lý do từ chối (tối thiểu ${MIN_REJECT_REASON_LENGTH} ký tự).`,
      );
    }
    note = reason;
  }

  const clinic = await getPilotClinic(client);

  return client.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: appointmentInclude,
    });

    if (!appointment || appointment.slot.doctor.clinicId !== clinic.id) {
      throw new DecisionError("NOT_FOUND", "Không tìm thấy lịch hẹn.");
    }

    if (appointment.status !== "pending") {
      throw new DecisionError(
        "ALREADY_DECIDED",
        appointment.status === "confirmed"
          ? "Lịch này đã được xác nhận, không thể xử lý lại."
          : "Lịch này đã bị từ chối, không thể xử lý lại.",
      );
    }

    const nextStatus = decision === "confirm" ? "confirmed" : "rejected";
    const updated = await tx.appointment.updateMany({
      where: { id: appointmentId, status: "pending" },
      data: {
        status: nextStatus,
        ...(note !== undefined ? { note } : {}),
      },
    });

    if (updated.count !== 1) {
      throw new DecisionError(
        "ALREADY_DECIDED",
        "Lịch này đã được xử lý, không thể xác nhận hoặc từ chối lại.",
      );
    }

    return tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: appointmentInclude,
    });
  });
}

/** HTTP mapping used by POST /api/receptionist/appointments/[id]. */
export function decisionHttpStatus(
  error: { name?: string; code?: string },
): number {
  if (error.name === "AuthError") {
    return error.code === "UNAUTHENTICATED" ? 401 : 403;
  }
  if (error.name === "DecisionError") {
    if (error.code === "NOT_FOUND") return 404;
    if (error.code === "ALREADY_DECIDED") return 409;
    return 400;
  }
  return 500;
}

export async function runReceptionistDecision(
  session: SessionUser | null,
  input: { appointmentId: string; decision: string; reason?: string },
  client: PrismaClient = prisma,
) {
  const appointment = await decideAppointment(session, input, client);
  return { appointment: serializeAppointment(appointment) };
}
