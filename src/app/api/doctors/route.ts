import { NextResponse } from "next/server";
import { assertPatient, AuthError, authHttpStatus, getSession } from "@/lib/auth";
import { listDoctors } from "@/lib/booking";

export const runtime = "nodejs";

export async function GET() {
  try {
    assertPatient(await getSession(), "Chỉ bệnh nhân mới xem danh sách bác sĩ để đặt lịch.");
    const doctors = await listDoctors();
    return NextResponse.json({
      doctors: doctors.map((doctor) => ({
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        clinicName: doctor.clinic.name,
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
    return NextResponse.json({ error: "Không tải được danh sách bác sĩ.", code: "ERROR" }, { status: 500 });
  }
}
