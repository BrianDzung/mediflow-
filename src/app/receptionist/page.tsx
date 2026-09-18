import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getSession } from "@/lib/auth";
import { formatSlotRange, statusLabel } from "@/lib/format";
import { loadReceptionistPendingList } from "@/lib/receptionist";

export const dynamic = "force-dynamic";

export default async function ReceptionistPendingPage() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "receptionist") {
    return (
      <div className="min-h-full">
        <AppHeader user={user} />
        <main className="mx-auto max-w-xl px-4 py-12">
          <h1 className="text-2xl font-semibold">Không có quyền truy cập</h1>
          <p className="mt-2 text-slate-600">
            Chỉ lễ tân mới xem danh sách lịch chờ xác nhận. Tài khoản bệnh nhân không
            vào được màn hình này.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            Về lịch của tôi
          </Link>
        </main>
      </div>
    );
  }

  const { clinic, appointments } = await loadReceptionistPendingList(user);

  return (
    <div className="min-h-full">
      <AppHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Lịch chờ xác nhận</h1>
        <p className="mt-2 text-slate-600">
          Phòng khám pilot: <strong>{clinic.name}</strong>. Danh sách mặc định chỉ hiện
          lịch <code>pending</code>.
        </p>

        {appointments.length === 0 ? (
          <p className="mt-8 rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-slate-600">
            Chưa có lịch chờ xác nhận. Đặt lịch bằng tài khoản bệnh nhân (M1) rồi tải
            lại trang này.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Bác sĩ</th>
                  <th className="px-4 py-3 font-medium">Bệnh nhân</th>
                  <th className="px-4 py-3 font-medium">SĐT</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatSlotRange(appointment.slot.startsAt, appointment.slot.endsAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{appointment.slot.doctor.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {appointment.slot.doctor.specialty}
                      </span>
                    </td>
                    <td className="px-4 py-3">{appointment.patientName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{appointment.patientPhone}</td>
                    <td className="px-4 py-3 font-semibold text-teal-800">
                      {statusLabel(appointment.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Xác nhận hoặc từ chối từng lịch (M3) chưa bật trên màn hình này.
        </p>
      </main>
    </div>
  );
}
