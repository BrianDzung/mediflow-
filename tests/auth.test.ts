import { PrismaClient } from "@prisma/client";
import { jwtVerify, SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertAuthenticated,
  assertPatient,
  assertReceptionist,
  authenticate,
  AuthError,
  authHttpStatus,
  bookingPageAccess,
  loginWithPassword,
  patientHomeAccess,
  postLoginPath,
  readSessionFromToken,
  receptionistPageAccess,
  revokeSessionFromToken,
} from "../src/lib/auth";
import { DEMO_PASSWORD, seedDatabase } from "../src/lib/seed-data";

const prisma = new PrismaClient();

function secretBytes() {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

beforeEach(async () => {
  await seedDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed accounts (M4)", () => {
  it("includes at least one patient and one receptionist with the README password", async () => {
    const users = await prisma.user.findMany({ select: { email: true, role: true } });
    expect(users).toEqual(
      expect.arrayContaining([
        { email: "patient@mediflow.demo", role: "patient" },
        { email: "receptionist@mediflow.demo", role: "receptionist" },
      ]),
    );

    await expect(
      authenticate("patient@mediflow.demo", DEMO_PASSWORD, prisma),
    ).resolves.toMatchObject({
      email: "patient@mediflow.demo",
      role: "patient",
      name: "Nguyễn Thị Hoa",
    });
    await expect(
      authenticate("receptionist@mediflow.demo", DEMO_PASSWORD, prisma),
    ).resolves.toMatchObject({
      email: "receptionist@mediflow.demo",
      role: "receptionist",
      name: "Phạm Thị Lan",
    });
  });
});

describe("login success and failure", () => {
  it("issues a readable session for seed credentials", async () => {
    const { user, token } = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    expect(user.role).toBe("patient");
    const session = await readSessionFromToken(token, prisma);
    expect(session).toMatchObject({
      id: user.id,
      email: "patient@mediflow.demo",
      role: "patient",
    });
  });

  it("rejects a wrong password with a clear error (401)", async () => {
    const error = await loginWithPassword(
      "patient@mediflow.demo",
      "wrong-password",
      undefined,
      prisma,
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Email hoặc mật khẩu không đúng.",
    });
    expect(authHttpStatus(error as AuthError)).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("rejects an unknown email without creating a session", async () => {
    await expect(
      authenticate("nobody@mediflow.demo", DEMO_PASSWORD, prisma),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Email hoặc mật khẩu không đúng.",
    });
  });
});

describe("role guards (pages + APIs)", () => {
  it("sends each role to its own post-login path and forbids the other flow", async () => {
    const patient = await authenticate("patient@mediflow.demo", DEMO_PASSWORD, prisma);
    const receptionist = await authenticate(
      "receptionist@mediflow.demo",
      DEMO_PASSWORD,
      prisma,
    );

    expect(postLoginPath(patient)).toBe("/");
    expect(postLoginPath(receptionist)).toBe("/receptionist");

    expect(bookingPageAccess(patient)).toBe("ok");
    expect(bookingPageAccess(receptionist)).toBe("forbidden");
    expect(bookingPageAccess(null)).toBe("login");

    expect(patientHomeAccess(patient)).toBe("ok");
    expect(patientHomeAccess(receptionist)).toBe("receptionist");
    expect(patientHomeAccess(null)).toBe("login");

    expect(receptionistPageAccess(receptionist)).toBe("ok");
    expect(receptionistPageAccess(patient)).toBe("forbidden");
    expect(receptionistPageAccess(null)).toBe("login");
  });

  it("does not mix patient and receptionist API roles", async () => {
    const patientLogin = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    const receptionistLogin = await loginWithPassword(
      "receptionist@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    const patientSession = await readSessionFromToken(patientLogin.token, prisma);
    const receptionistSession = await readSessionFromToken(receptionistLogin.token, prisma);

    expect(patientSession?.role).toBe("patient");
    expect(receptionistSession?.role).toBe("receptionist");

    expect(() => assertReceptionist(patientSession)).toThrowError(AuthError);
    expect(() => assertPatient(receptionistSession)).toThrowError(AuthError);
    expect(authHttpStatus(new AuthError("FORBIDDEN", "no"))).toBe(403);

    expect(assertPatient(patientSession).id).toBe(patientLogin.user.id);
    expect(assertReceptionist(receptionistSession).id).toBe(receptionistLogin.user.id);
  });

  it("loads role from the database so a JWT claim cannot swap roles", async () => {
    const { user, token } = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    const { payload } = await jwtVerify(token, secretBytes());

    const forged = await new SignJWT({
      email: user.email,
      role: "receptionist",
      name: user.name,
      phone: user.phone,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setJti(String(payload.jti))
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secretBytes());

    const resolved = await readSessionFromToken(forged, prisma);
    expect(resolved?.role).toBe("patient");
    expect(() => assertReceptionist(resolved)).toThrowError(/lễ tân/i);
  });
});

describe("logout invalidates the session", () => {
  it("rejects the old token on protected session reads after revoke", async () => {
    const { token } = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    expect(await readSessionFromToken(token, prisma)).not.toBeNull();

    await revokeSessionFromToken(token, prisma);

    const session = await readSessionFromToken(token, prisma);
    expect(session).toBeNull();
    expect(await prisma.session.count()).toBe(0);
    expect(() => assertAuthenticated(session)).toThrowError(AuthError);
    expect(authHttpStatus(new AuthError("UNAUTHENTICATED", "Vui lòng đăng nhập."))).toBe(401);
  });

  it("switching accounts revokes the previous cookie's session", async () => {
    const patient = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    const receptionist = await loginWithPassword(
      "receptionist@mediflow.demo",
      DEMO_PASSWORD,
      patient.token,
      prisma,
    );

    expect(await readSessionFromToken(patient.token, prisma)).toBeNull();
    expect(await readSessionFromToken(receptionist.token, prisma)).toMatchObject({
      role: "receptionist",
      email: "receptionist@mediflow.demo",
    });
  });

  it("a second login for the same user invalidates the previous token", async () => {
    const first = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );
    const second = await loginWithPassword(
      "patient@mediflow.demo",
      DEMO_PASSWORD,
      undefined,
      prisma,
    );

    expect(await readSessionFromToken(first.token, prisma)).toBeNull();
    expect(await readSessionFromToken(second.token, prisma)).toMatchObject({
      email: "patient@mediflow.demo",
    });
  });
});
