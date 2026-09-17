import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import {
  bookAppointment,
  BookingError,
  listPatientAppointments,
  serializeAppointment,
} from "@/lib/booking";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (session.role !== "patient") {
    return NextResponse.json(
      { error: "Chỉ bệnh nhân mới xem lịch của mình tại đây.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const appointments = await listPatientAppointments(session.id);
  return NextResponse.json({
    appointments: appointments.map(serializeAppointment),
  });
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      throw new AuthError("UNAUTHENTICATED", "Vui lòng đăng nhập.");
    }
    if (session.role !== "patient") {
      throw new BookingError("FORBIDDEN", "Chỉ bệnh nhân mới được đặt lịch.");
    }

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
      return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
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
