import { NextResponse } from "next/server";
import { authenticate, AuthError, createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

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

    const user = await authenticate(email, password);
    const token = await createSessionToken(user);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      const status = error.code === "INVALID_CREDENTIALS" ? 401 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error(error);
    return NextResponse.json({ error: "Không thể đăng nhập.", code: "ERROR" }, { status: 500 });
  }
}
