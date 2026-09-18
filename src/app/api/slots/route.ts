import { NextResponse } from "next/server";
import { assertPatient, AuthError, authHttpStatus, getSession } from "@/lib/auth";
import { listOpenSlots } from "@/lib/booking";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertPatient(await getSession(), "Chỉ bệnh nhân mới xem khung giờ trống để đặt lịch.");

    const { searchParams } = new URL(request.url);
    const doctorId = searchParams.get("doctorId")?.trim() ?? "";
    if (!doctorId) {
      return NextResponse.json({ error: "Thiếu bác sĩ.", code: "VALIDATION" }, { status: 400 });
    }

    const slots = await listOpenSlots(doctorId);
    return NextResponse.json({
      slots: slots.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: authHttpStatus(error) },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Không tải được khung giờ.", code: "ERROR" }, { status: 500 });
  }
}
