import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? "e2e-staging-reset-token";

export const patient = {
  email: "patient@mediflow.demo",
  password: "demo1234",
  name: "Nguyễn Thị Hoa",
} as const;

export const receptionist = {
  email: "receptionist@mediflow.demo",
  password: "demo1234",
  name: "Phạm Thị Lan",
} as const;

export const SESSION_COOKIE = "mediflow_session";

export async function resetDemoData(request: APIRequestContext) {
  const response = await request.post("/api/staging/reset", {
    headers: { Authorization: `Bearer ${RESET_TOKEN}` },
  });
  expect(response.ok(), `reset failed: ${response.status()} ${await response.text()}`).toBeTruthy();
}

export async function loginAs(
  page: Page,
  user: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(user.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toHaveCount(0);
}

export async function sessionCookieValue(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value;
}

export async function bookFirstOpenSlot(page: Page) {
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Đặt lịch khám" })).toBeVisible();
  const slot = page.getByRole("radio").first();
  await expect(slot).toBeVisible();
  await slot.check();
  await page.getByRole("button", { name: "Gửi yêu cầu đặt lịch" }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText("Đã gửi yêu cầu đặt lịch.");
  await expect(status).toContainText("Chờ xác nhận (pending)");
  return status;
}
