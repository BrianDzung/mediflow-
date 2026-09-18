import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  applySessionCookie,
  AuthError,
  authHttpStatus,
  loginWithPassword,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Vui lòng nhập email và mật khẩu.", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const store = await cookies();
    const incomingToken = store.get(SESSION_COOKIE)?.value;
    const { user, token } = await loginWithPassword(email, password, incomingToken);
    const response = NextResponse.json({ user });
    applySessionCookie(response, token);
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: authHttpStatus(error) },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Không thể đăng nhập.", code: "ERROR" }, { status: 500 });
  }
}
