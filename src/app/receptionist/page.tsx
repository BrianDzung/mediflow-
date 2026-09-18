import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ReceptionistPendingBoard } from "@/components/ReceptionistPendingBoard";
import { getSession } from "@/lib/auth";
import { serializeAppointment } from "@/lib/booking";
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
        <ReceptionistPendingBoard
          clinicName={clinic.name}
          appointments={appointments.map(serializeAppointment)}
        />
      </main>
    </div>
  );
}
