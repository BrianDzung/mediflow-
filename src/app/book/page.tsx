import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { BookingForm } from "@/components/BookingForm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const user = await getSession();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "patient") {
    redirect("/");
  }

  return (
    <div className="min-h-full">
      <AppHeader user={user} />
      <main className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Đặt lịch khám</h1>
        <p className="mt-2 text-sm text-slate-600">
          Chọn bác sĩ, khung giờ còn trống, rồi gửi yêu cầu. Lễ tân sẽ xác nhận hoặc
          từ chối trên màn hình chờ.
        </p>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <BookingForm defaultName={user.name} defaultPhone={user.phone ?? ""} />
        </div>
      </main>
    </div>
  );
}
