import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listDoctors } from "@/lib/booking";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const doctors = await listDoctors();
  return NextResponse.json({
    doctors: doctors.map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      specialty: doctor.specialty,
      clinicName: doctor.clinic.name,
    })),
  });
}
