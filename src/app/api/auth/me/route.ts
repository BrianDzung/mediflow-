import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  return NextResponse.json({ user });
}
