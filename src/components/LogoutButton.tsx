"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  userName: string;
  userRole?: string;
};

export function LogoutButton({ userName, userRole }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-teal-50 sm:inline">
        {userName}
        {userRole ? ` · ${userRole}` : ""}
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="rounded-md border border-teal-200/40 px-3 py-1.5 text-teal-50 hover:bg-teal-800 disabled:opacity-60"
      >
        Đăng xuất
      </button>
    </div>
  );
}
