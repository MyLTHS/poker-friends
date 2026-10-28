// C4: the D1 account screens on the real server (login, guest, upgrade, profile, signup, forgot,
// email links), desktop and landscape phone. Emails are printed by Django (no EMAIL_URL), so the
// tests check what the screens say, not the mailbox.

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "ban-ni-xanh-2026";
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function playAsGuest(page: Page) {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Chơi ngay bằng khách" }).click();
  await expect(page.getByText("Thẻ khách")).toBeVisible();
}

test("a guest upgrades with email, lands on the profile, then logs out", async ({ page }) => {
  await playAsGuest(page);
  await expect(page.getByRole("heading", { name: "Trở thành thành viên" })).toBeVisible();

  const email = `e2e-${unique()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Nâng cấp & giữ chip" }).click();

  await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByText("Chưa xác minh")).toBeVisible();
  await expect(page.getByText(/Đã nâng cấp\. Mở email/)).toBeVisible();

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại" }).first()).toBeVisible();

  // The account exists but its email is not verified yet: the login says so and offers the link.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("Email này chưa được xác minh", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi lại link xác minh" })).toBeVisible();
});

test("a guest who logs out is asked first, and staying keeps the guest", async ({ page }) => {
  await playAsGuest(page);
  await page.getByRole("button", { name: "Rời tài khoản khách" }).click();
  await expect(page.getByRole("dialog", { name: "Rời tài khoản khách?" })).toBeVisible();
  await page.getByRole("button", { name: "Ở lại" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Thẻ khách")).toBeVisible();
});

test("a wrong password shows the error on the form", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Email").fill(`nobody-${unique()}@example.com`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password-1");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sai email hoặc mật khẩu." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chào mừng trở lại" }).first()).toBeVisible();
});

test("signing up moves to step 2 with the email the link went to", async ({ page }) => {
  const id = unique();
  const email = `signup-${id}@example.com`;
  await page.goto("/account/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Tên ở bàn").fill(`Ban${id}`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await expect(page.getByText("Độ mạnh:", { exact: false })).toBeAttached();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(page.getByText(`Đã gửi link tới ${email}`, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi lại link xác minh" })).toBeVisible();

  // The same email again: the server's answer shows on the form.
  await page.getByRole("button", { name: "Sửa email" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Tên ở bàn").fill(`Khac${id}`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Email này đã thuộc một tài khoản khác", { exact: false }).first()).toBeVisible();
});

test("forgot password confirms without saying whether the email has an account", async ({ page }) => {
  await page.goto("/account/forgot");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Gửi link đặt lại" }).click();
  await expect(page.getByText("Đã gửi tới s•••@example.com")).toBeVisible();
  await expect(page.getByText("Nếu email này có tài khoản", { exact: false })).toBeVisible();
});

test("a broken reset link and a broken verify link say so", async ({ page }) => {
  await page.goto("/account/reset?uid=1&token=not-a-token");
  await page.getByLabel("Mật khẩu mới").fill(PASSWORD);
  await page.getByLabel("Nhập lại").fill(PASSWORD);
  await expect(page.getByText("Hai mật khẩu khớp nhau")).toBeVisible();
  await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Link không dùng được nữa" })).toBeVisible();

  await page.goto("/account/verify?token=not-a-token");
  await expect(page.getByRole("heading", { name: "Link không dùng được" })).toBeVisible();
});

test.describe("landscape phone", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("the login keeps its small hero; other pages get the bar", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator(".m-hero")).toBeVisible();
    await expect(page.locator(".auth-hero")).toBeHidden();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeInViewport();

    await page.goto("/account/signup");
    await expect(page.locator(".appbar").getByText("Tạo tài khoản")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo tài khoản" })).toBeVisible();
  });
});

test("reduced motion: the form card fades in instead of rising", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/account");
  const card = page.locator(".auth-card").first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("auth-fade");
});
