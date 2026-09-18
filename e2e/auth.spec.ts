import { expect, test } from "@playwright/test";
import {
  loginAs,
  patient,
  receptionist,
  resetDemoData,
  sessionCookieValue,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetDemoData(request);
});

test("patient logs in with seed credentials", async ({ page }) => {
  await loginAs(page, patient);
  await expect(page.getByRole("heading", { name: "Lịch khám của tôi" })).toBeVisible();
  await expect(page.getByText("Bệnh nhân")).toBeVisible();
  await expect(page.getByRole("link", { name: "Đặt lịch" })).toBeVisible();
});

test("wrong password shows an error and stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(patient.email);
  await page.getByLabel("Mật khẩu").fill("wrong-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Email hoặc mật khẩu không đúng.");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
});

test("patient cannot open the receptionist UI or API", async ({ page, request }) => {
  await loginAs(page, patient);
  await expect(page.getByRole("heading", { name: "Lịch khám của tôi" })).toBeVisible();

  await page.goto("/receptionist");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Về lịch của tôi" })).toBeVisible();

  const token = await sessionCookieValue(page);
  expect(token).toBeTruthy();
  const response = await request.get("/api/receptionist/appointments", {
    headers: { Cookie: `mediflow_session=${token}` },
  });
  expect(response.status()).toBe(403);
});

test("receptionist lands on the pending list", async ({ page }) => {
  await loginAs(page, receptionist);
  await expect(page.getByRole("heading", { name: "Lịch chờ xác nhận" })).toBeVisible();
  await expect(page.getByText("Lễ tân")).toBeVisible();
  await expect(page.getByText("Chưa có lịch chờ xác nhận")).toBeVisible();
});

test("logout blocks protected pages and the old session API", async ({ page, request }) => {
  await loginAs(page, patient);
  await expect(page.getByRole("heading", { name: "Lịch khám của tôi" })).toBeVisible();

  const token = await sessionCookieValue(page);
  expect(token).toBeTruthy();

  const meBefore = await request.get("/api/auth/me", {
    headers: { Cookie: `mediflow_session=${token}` },
  });
  expect(meBefore.ok()).toBeTruthy();

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();

  await page.goto("/book");
  await expect(page).toHaveURL(/\/login/);

  const meAfter = await request.get("/api/auth/me", {
    headers: { Cookie: `mediflow_session=${token}` },
  });
  expect(meAfter.status()).toBe(401);
  await expect(meAfter.json()).resolves.toMatchObject({ code: "UNAUTHENTICATED" });
});
