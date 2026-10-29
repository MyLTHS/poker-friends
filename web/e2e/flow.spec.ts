// C5: the whole evening in two browsers. Every step a player takes goes through the pages: the
// owner creates a private room and lands at its table with the invite link, a friend with no
// account opens it and types a name; both sit, the owner grants chips from the panel on the table
// itself, one hand is played to the end with the C key, and the history lists that hand with its
// replay. REST is only used to make the owner a guest and to read the result for checking.

import { expect, test, type Page } from "@playwright/test";

import { api, checkOrCallWithKey, turnBar, watchActions } from "./helpers";

const RUN = Date.now().toString(36).slice(-4);

/** The owner comes in as a guest (the same call the account page's guest form makes). */
async function guestPage(page: Page, name: string) {
  await api(page, "GET", "/api/auth/config/");
  await api(page, "POST", "/api/auth/guest/", { username: name });
}

test("private room → invite link → friend joins → both sit → chips from the table → one hand → history", async ({ browser }) => {
  test.setTimeout(240_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerCtx.newPage();
  const ownerSeen = watchActions(owner);
  await guestPage(owner, `Chu${RUN}`);

  // 1. Create a private room from the lobby: straight to its table, the invite link open.
  await owner.goto("/rooms");
  await owner.getByRole("link", { name: "Tạo bàn" }).first().click();
  await expect(owner).toHaveURL(/\/rooms\/new$/);
  await owner.getByLabel("Tên bàn").fill("Tối thứ Sáu");
  await owner.getByText("Thêm tuỳ chọn").click();
  await owner.getByRole("radio", { name: "2", exact: true }).click();
  await owner.getByRole("radio", { name: /Riêng/ }).click();
  await owner.getByRole("button", { name: "Tạo bàn" }).click();
  await expect(owner).toHaveURL(/\/rooms\/\d+\/table$/);
  const roomId = Number(new URL(owner.url()).pathname.split("/")[2]);
  expect((await api(owner, "GET", `/api/rooms/${roomId}/`)).is_private).toBe(true);
  const inviteSheet = owner.getByRole("dialog", { name: "Mời bạn vào bàn" });
  const invite = new URL((await inviteSheet.getByTestId("invite-link").getAttribute("title"))!);
  await owner.keyboard.press("Escape");
  await expect(inviteSheet).toBeHidden();
  await owner.getByRole("button", { name: "Ngồi vào ghế 1" }).click();
  const seated = async () => (await api(owner, "GET", `/api/rooms/${roomId}/snapshot/`)).table.seats.map((s: { seat: number }) => s.seat);
  await expect.poll(seated).toEqual([1]);

  // 2. The friend (no account) opens the link, types a name and sits at the table.
  const friendCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const friend = await friendCtx.newPage();
  const friendSeen = watchActions(friend);
  await friend.goto(invite.pathname + invite.search);
  await friend.getByLabel("Tên ở bàn").fill(`Khach${RUN}`);
  await friend.getByRole("button", { name: "Vào chơi" }).click();
  await expect(friend).toHaveURL(new RegExp(`/rooms/${roomId}/table$`));
  await friend.getByRole("button", { name: "Ngồi vào ghế 2" }).click();
  await expect.poll(seated).toEqual([1, 2]);

  // 3. The owner grants chips from the crown on the table.
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

  // 4. The hand deals; whoever is to act checks or calls with the C key until it is over. Each
  // press must reach the server as exactly one check/call of that player (not a timeout).
  for (const p of [owner, friend]) await expect(p.locator("[data-hand=live]")).toBeVisible();
  for (let moves = 0; moves < 20; moves++) {
    const next = await expect
      .poll(async () => ((await owner.locator("[data-hand=complete]").count()) ? "done" : (await turnBar(owner).count()) ? "owner" : (await turnBar(friend).count()) ? "friend" : ""), { timeout: 20_000 })
      .not.toBe("")
      .then(async () => ((await owner.locator("[data-hand=complete]").count()) ? "done" : (await turnBar(owner).count()) ? "owner" : "friend"));
    if (next === "done") break;
    if (next === "owner") await checkOrCallWithKey(owner, ownerSeen, 1);
    else await checkOrCallWithKey(friend, friendSeen, 2);
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
