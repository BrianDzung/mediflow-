import { redirect } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { listPatientAppointments } from "@/lib/booking";
import { formatSlotRange, statusLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
  }

  if (user.role === "receptionist") {
    const pendingCount = await prisma.appointment.count({
      where: { status: "pending" },
    });
    return (
      <div className="min-h-full">
        <AppHeader user={user} />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <h1 className="text-2xl font-semibold">Xin chào, {user.name}</h1>
          <p className="mt-2 text-slate-600">
            Bạn đang đăng nhập vai trò lễ tân. Danh sách xác nhận lịch (M2) và thao tác
            xác nhận/từ chối (M3) sẽ bổ sung ở sprint tiếp theo.
          </p>
          <p className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
            Hiện có <strong>{pendingCount}</strong> lịch đang <code>pending</code>.
          </p>
        </main>
      </div>
    );
  }

  const appointments = await listPatientAppointments(user.id);

  return (
    <div className="min-h-full">
      <AppHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Lịch khám của tôi</h1>
            <p className="mt-1 text-slate-600">Xin chào, {user.name}</p>
          </div>
          <Link
            href="/book"
            className="rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            Đặt lịch khám
          </Link>
        </div>

        {appointments.length === 0 ? (
          <p className="mt-8 rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-slate-600">
            Chưa có lịch nào. Chọn bác sĩ và khung giờ để gửi yêu cầu.
          </p>
        ) : (
          <ul className="mt-6 space-y-3">
            {appointments.map((appointment) => (
              <li
                key={appointment.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <p className="font-medium">{appointment.slot.doctor.name}</p>
                <p className="text-sm text-slate-600">
                  {formatSlotRange(appointment.slot.startsAt, appointment.slot.endsAt)}
                </p>
                <p className="mt-1 text-sm">
                  {appointment.patientName} — {appointment.patientPhone}
                </p>
                <p className="mt-2 text-sm font-semibold text-teal-800">
                  {statusLabel(appointment.status)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
