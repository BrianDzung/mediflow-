import { NextResponse } from "next/server";
import { assertPatient, AuthError, authHttpStatus, getSession } from "@/lib/auth";
import {
  bookAppointment,
  BookingError,
  listPatientAppointments,
  serializeAppointment,
} from "@/lib/booking";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = assertPatient(await getSession());
    const appointments = await listPatientAppointments(session.id);
    return NextResponse.json({
      appointments: appointments.map(serializeAppointment),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: authHttpStatus(error) },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Không tải được lịch hẹn.", code: "ERROR" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = assertPatient(await getSession());

    const body = (await request.json()) as {
      slotId?: string;
      patientName?: string;
      patientPhone?: string;
    };

    const appointment = await bookAppointment({
      patientUserId: session.id,
      slotId: body.slotId ?? "",
      patientName: body.patientName ?? "",
      patientPhone: body.patientPhone ?? "",
    });

    return NextResponse.json({ appointment: serializeAppointment(appointment) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: authHttpStatus(error) },
      );
    }
    if (error instanceof BookingError) {
      const status =
        error.code === "FORBIDDEN"
          ? 403
          : error.code === "SLOT_NOT_FOUND"
            ? 404
            : error.code === "SLOT_TAKEN"
              ? 409
              : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error(error);
    return NextResponse.json({ error: "Không thể tạo lịch hẹn.", code: "ERROR" }, { status: 500 });
  }
}
