import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "mediflow_session";

export type UserRole = "patient" | "receptionist";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  phone: string | null;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function readSessionFromToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      (payload.role !== "patient" && payload.role !== "receptionist") ||
      typeof payload.name !== "string"
    ) {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
      phone: typeof payload.phone === "string" ? payload.phone : null,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSessionFromToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionUser> {
  return assertAuthenticated(await getSession());
}

export function assertAuthenticated(session: SessionUser | null): SessionUser {
  if (!session) {
    throw new AuthError("UNAUTHENTICATED", "Vui lòng đăng nhập.");
  }
  return session;
}

export function assertReceptionist(session: SessionUser | null): SessionUser {
  const user = assertAuthenticated(session);
  if (user.role !== "receptionist") {
    throw new AuthError(
      "FORBIDDEN",
      "Chỉ lễ tân mới xem danh sách lịch chờ xác nhận.",
    );
  }
  return user;
}

export async function requireReceptionist(): Promise<SessionUser> {
  return assertReceptionist(await getSession());
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_CREDENTIALS",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function authenticate(
  email: string,
  password: string,
): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) {
    throw new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AuthError("INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role as UserRole,
    name: user.name,
    phone: user.phone,
  };
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
