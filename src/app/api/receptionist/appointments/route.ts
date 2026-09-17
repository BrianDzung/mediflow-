import { NextResponse } from "next/server";
import { AuthError, getSession } from "@/lib/auth";
import { serializeAppointment } from "@/lib/booking";
import { loadReceptionistPendingList } from "@/lib/receptionist";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    const { clinic, appointments } = await loadReceptionistPendingList(session);
    return NextResponse.json({
      clinic: { id: clinic.id, name: clinic.name },
      appointments: appointments.map(serializeAppointment),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error(error);
    return NextResponse.json(
      { error: "Không tải được danh sách lịch chờ xác nhận.", code: "ERROR" },
      { status: 500 },
    );
  }
}
