import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export function AppHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="bg-teal-700 text-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href={user ? "/" : "/login"} className="font-semibold tracking-tight">
          MediFlow
        </Link>
        {user ? (
          <div className="flex items-center gap-4">
            {user.role === "patient" ? (
              <nav className="flex gap-3 text-sm text-teal-50">
                <Link className="hover:underline" href="/">
                  Lịch của tôi
                </Link>
                <Link className="hover:underline" href="/book">
                  Đặt lịch
                </Link>
              </nav>
            ) : (
              <span className="text-sm text-teal-100">Lễ tân</span>
            )}
            <LogoutButton userName={user.name} />
          </div>
        ) : null}
      </div>
    </header>
  );
}
