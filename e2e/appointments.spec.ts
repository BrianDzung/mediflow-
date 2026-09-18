import { expect, test } from "@playwright/test";
import {
  bookFirstOpenSlot,
  loginAs,
  patient,
  receptionist,
  resetDemoData,
} from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetDemoData(request);
});

test("patient books an appointment and sees pending", async ({ page }) => {
  await loginAs(page, patient);
  await bookFirstOpenSlot(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lịch khám của tôi" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: patient.name });
  await expect(row).toContainText("Chờ xác nhận (pending)");
});

test("receptionist sees the pending booking, confirms, and the patient sees confirmed", async ({
  page,
}) => {
  await loginAs(page, patient);
  await bookFirstOpenSlot(page);

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();

  await loginAs(page, receptionist);
  await expect(page.getByRole("heading", { name: "Lịch chờ xác nhận" })).toBeVisible();
  const pendingRow = page.getByRole("row").filter({ hasText: patient.name });
  await expect(pendingRow).toContainText("Chờ xác nhận (pending)");

  await pendingRow.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã xác nhận lịch.");
  await expect(page.getByRole("row").filter({ hasText: patient.name })).toHaveCount(0);

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await loginAs(page, patient);
  await expect(page.getByRole("heading", { name: "Lịch khám của tôi" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: patient.name })).toContainText(
    "Đã xác nhận (confirmed)",
  );
});

test("receptionist rejects another booking with a reason and the patient sees rejected", async ({
  page,
}) => {
  await loginAs(page, patient);
  await bookFirstOpenSlot(page);

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await loginAs(page, receptionist);

  const pendingRow = page.getByRole("row").filter({ hasText: patient.name });
  await expect(pendingRow).toContainText("Chờ xác nhận (pending)");
  await pendingRow.getByRole("button", { name: "Từ chối", exact: true }).click();

  const reason = "Kín lịch bác sĩ";
  await pendingRow.getByLabel("Lý do từ chối").fill(reason);
  await pendingRow.getByRole("button", { name: "Gửi từ chối" }).click();
  await expect(page.getByRole("status")).toContainText("Đã từ chối lịch.");
  await expect(page.getByRole("row").filter({ hasText: patient.name })).toHaveCount(0);

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await loginAs(page, patient);
  const row = page.getByRole("listitem").filter({ hasText: patient.name });
  await expect(row).toContainText("Từ chối (rejected)");
  await expect(row).toContainText(`Lý do: ${reason}`);
});
