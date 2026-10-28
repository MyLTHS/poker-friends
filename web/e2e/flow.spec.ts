// C5: the whole evening in two browsers, through the pages only (no REST shortcuts): the owner
// creates a private room, sends the invite link, a friend with no account opens it; both sit,
// the owner grants chips from the panel on the table itself, one hand is played to the end with
// the keyboard shortcuts, and the history lists that hand with its replay.

import { expect, test, type Page } from "@playwright/test";

import { api } from "./helpers";

const RUN = Date.now().toString(36).slice(-4);

/** The owner comes in as a guest (the same call the account page's guest form makes). */
async function guestPage(page: Page, name: string) {
  await api(page, "GET", "/api/auth/config/");
  await api(page, "POST", "/api/auth/guest/", { username: name });
}

const turnBar = (page: Page) => page.getByRole("region", { name: "Tới lượt bạn" });

test("private room → invite link → friend joins → both sit → chips from the table → one hand → history", async ({ browser }) => {
  test.setTimeout(240_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerCtx.newPage();
  await guestPage(owner, `Chu${RUN}`);

  // 1. Create a private room from the lobby.
  await owner.goto("/rooms");
  await owner.getByRole("link", { name: "Tạo phòng" }).first().click();
  await expect(owner).toHaveURL(/\/rooms\/new$/);
  await owner.getByLabel("Tên phòng").fill("Tối thứ Sáu");
  await owner.getByRole("radio", { name: "2", exact: true }).click();
  await owner.getByRole("radio", { name: /Riêng/ }).click();
  await owner.getByRole("button", { name: "Tạo phòng & lấy link mời" }).click();
  await expect(owner).toHaveURL(/\/rooms\/\d+$/);
  const roomId = Number(new URL(owner.url()).pathname.split("/").pop());
  await expect(owner.getByText("Riêng").first()).toBeVisible();
  const invite = new URL((await owner.getByTestId("invite-link").getAttribute("title"))!);
  await owner.getByRole("button", { name: "Ngồi đây" }).first().click();
  await expect(owner.getByText("Đã ngồi ghế 1")).toBeVisible();

  // 2. The friend (no account) opens the link and sits.
  const friendCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const friend = await friendCtx.newPage();
  await friend.goto(invite.pathname + invite.search);
  await expect(friend).toHaveURL(new RegExp(`/rooms/${roomId}$`));
  await expect(friend.getByText("Bạn đã vào Tối thứ Sáu")).toBeVisible();
  await friend.getByRole("button", { name: "Ngồi đây" }).first().click();
  await expect(friend.getByText("Đã ngồi ghế 2")).toBeVisible();

  // 3. Both open the table; the owner grants chips from the crown on the table.
  await owner.getByRole("link", { name: /Về bàn|Vào bàn/ }).first().click();
  await expect(owner).toHaveURL(new RegExp(`/rooms/${roomId}/table$`));
  await friend.goto(`/rooms/${roomId}/table`);
  for (const p of [owner, friend]) await expect(p.locator("[data-hand=none]")).toBeVisible();
  await owner.getByRole("button", { name: "Bảng chủ phòng" }).click();
  const sheet = owner.getByRole("dialog", { name: /Bảng chủ phòng/ });
  for (const seat of ["Ghế 1", "Ghế 2"]) {
    const row = sheet.getByRole("listitem").filter({ hasText: seat });
    await row.getByRole("button", { name: "Cấp/trừ" }).click();
    await row.getByRole("button", { name: "Cấp 500" }).click();
    await expect(row.locator(".op-stack")).toHaveText("500");
  }
  await owner.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // 4. The hand deals; whoever is to act checks or calls with the C key until it is over.
  for (const p of [owner, friend]) await expect(p.locator("[data-hand=live]")).toBeVisible();
  for (let moves = 0; moves < 20; moves++) {
    if ((await owner.locator("[data-hand=complete]").count()) > 0) break;
    const actor = await expect
      .poll(async () => ((await turnBar(owner).count()) ? "owner" : (await turnBar(friend).count()) ? "friend" : (await owner.locator("[data-hand=complete]").count()) ? "done" : ""), { timeout: 20_000 })
      .not.toBe("")
      .then(async () => ((await turnBar(owner).count()) ? owner : (await turnBar(friend).count()) ? friend : null));
    if (!actor) break;
    const version = await actor.locator("[data-version]").getAttribute("data-version");
    await actor.keyboard.press("c");
    await expect(actor.locator("[data-version]")).not.toHaveAttribute("data-version", version ?? "");
  }
  for (const p of [owner, friend]) await expect(p.locator("[data-hand=complete]")).toBeVisible();
  await expect(owner.getByRole("status").filter({ hasText: /thắng|chia pot/ }).first()).toBeVisible();

  // 5. The history shows that hand; its replay opens.
  await owner.goto(`/rooms/${roomId}/history`);
  const replay = owner.getByRole("link", { name: "Xem lại ván #1" }).first();
  await expect(replay).toBeVisible();
  const hands = await api(owner, "GET", `/api/rooms/${roomId}/hands/`);
  expect(hands.hands).toHaveLength(1);
  // chips moved, none appeared or vanished
  expect(hands.hands[0].players.reduce((s: number, p: { net: number }) => s + p.net, 0)).toBe(0);
  await replay.click();
  await expect(owner).toHaveURL(new RegExp(`/hands/${hands.hands[0].hand_id}$`));
  await expect(owner.locator(".rp-step")).toContainText("1/");

  await ownerCtx.close();
  await friendCtx.close();
});
