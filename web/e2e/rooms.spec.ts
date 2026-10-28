// C4: the room screens on the real server. An opens a table from the lobby, Bình (a new visitor,
// not logged in) opens the invite link, sits down, and An grants chips from the owner's panel.

import { expect, test, type Browser, type Page } from "@playwright/test";

const WEB = "http://localhost:3100";

async function api(page: Page, method: string, path: string, data?: unknown) {
  const cookies = await page.context().cookies(WEB);
  const csrf = cookies.find((c) => c.name === "csrftoken")?.value ?? "";
  const response = await page.request.fetch(WEB + path, {
    method,
    data,
    headers: { "X-CSRFToken": csrf, Referer: `${WEB}/`, Origin: WEB },
  });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.status() === 204 ? null : response.json();
}

async function newGuest(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await api(page, "GET", "/api/auth/config/");
  await api(page, "POST", "/api/auth/guest/", { username: name });
  return page;
}

test("lobby → create a room → invite link → a new visitor joins and sits; the owner grants chips", async ({ browser }) => {
  const an = await newGuest(browser, "An");

  // The lobby, then the create form.
  await an.goto("/rooms");
  await expect(an.getByRole("heading", { name: "Chọn một bàn" })).toBeVisible();
  await an.getByRole("link", { name: "Tạo phòng" }).first().click();
  await expect(an).toHaveURL(/\/rooms\/new$/);
  await an.getByLabel("Tên phòng").fill("Bàn E2E C4");
  await an.getByRole("radio", { name: "6", exact: true }).click();
  await expect(an.locator(".create-preview")).toContainText("6 ghế");
  await an.getByRole("button", { name: "Tạo phòng & lấy link mời" }).click();

  // The room page with the invite link and its QR.
  await expect(an).toHaveURL(/\/rooms\/\d+$/);
  const roomId = Number(new URL(an.url()).pathname.split("/").pop());
  await expect(an.getByRole("heading", { name: "Bàn E2E C4" }).first()).toBeVisible();
  await expect(an.getByRole("img", { name: /Mã QR của link mời/ })).toBeVisible();
  const shown = await an.getByTestId("invite-link").getAttribute("title");
  expect(shown).toMatch(/\/rooms\/join\?token=[\w-]+$/);
  const invite = new URL(shown!);

  // A visitor with no account opens the link: the server makes them a guest.
  const binh = await (await browser.newContext()).newPage();
  await binh.goto(invite.pathname + invite.search);
  const card = binh.getByRole("article", { name: "Thiệp mời" });
  await expect(card).toContainText("An mời bạn vào");
  await expect(card.getByRole("heading", { name: "Bàn E2E C4" })).toBeVisible();
  await expect(card).toContainText("Bạn vào bằng khách");
  await card.getByRole("link", { name: "Vào phòng" }).click();
  await expect(binh).toHaveURL(new RegExp(`/rooms/${roomId}$`));
  await binh.getByRole("button", { name: "Ngồi đây" }).first().click();
  await expect(binh.getByText("Đã ngồi ghế 1")).toBeVisible();

  // The owner's panel: grant Bình 500 chips.
  await an.reload();
  await an.getByRole("button", { name: "Bảng chủ phòng" }).click();
  const sheet = an.getByRole("dialog", { name: /Bảng chủ phòng/ });
  const row = sheet.getByRole("listitem").filter({ hasText: /Ghế 1/ });
  await row.getByRole("button", { name: "Cấp/trừ" }).click();
  await row.getByRole("button", { name: "Cấp 500" }).click();
  await expect(an.getByText(/Đã cấp 500 chip cho/)).toBeVisible();
  await expect(row.locator(".op-stack")).toHaveText("500");
  const seats = await api(an, "GET", `/api/rooms/${roomId}/snapshot/`);
  expect(seats.table.seats[0].stack).toBe(500);
});

test("a wrong invite link says so and leads back to the lobby", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/rooms/join?token=khong-co-ma-nay-123");
  await expect(page.getByText("Link mời không dùng được")).toBeVisible();
  await page.getByRole("link", { name: "Về sảnh" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
});
