import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSession();
  if (user) {
    redirect("/");
  }

  return (
    <div className="min-h-full">
      <AppHeader user={null} />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-semibold">Đăng nhập</h1>
        <p className="mt-2 text-sm text-slate-600">
          Dùng tài khoản seed để demo đặt lịch (M1).
        </p>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Bệnh nhân: patient@mediflow.demo / demo1234
        </p>
      </main>
    </div>
  );
}
