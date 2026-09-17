import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listOpenSlots } from "@/lib/booking";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập.", code: "UNAUTHENTICATED" }, { status: 401 });
  }

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
}
