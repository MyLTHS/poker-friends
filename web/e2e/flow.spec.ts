// C5: the whole evening in two browsers. Every step a player takes goes through the pages: the
// owner creates a private room, sends the invite link, a friend with no account opens it; both
// sit (the chips come with the seats, no owner needed), one hand is played to the end
// with the C key, and the history lists that hand with its replay. REST is only used to make the
// owner a guest and to read the result for checking.

import { expect, test, type Page } from "@playwright/test";

import { api, checkOrCallWithKey, turnBar, watchActions } from "./helpers";

const RUN = Date.now().toString(36).slice(-4);

/** The owner comes in as a guest (the same call the account page's guest form makes). */
async function guestPage(page: Page, name: string) {
  await api(page, "GET", "/api/auth/config/");
  await api(page, "POST", "/api/auth/guest/", { username: name });
}

test("private room → invite link → friend joins → both sit with chips → one hand → history", async ({ browser }) => {
  test.setTimeout(240_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerCtx.newPage();
  const ownerSeen = watchActions(owner);
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
  const friendSeen = watchActions(friend);
  await friend.goto(invite.pathname + invite.search);
  await expect(friend).toHaveURL(new RegExp(`/rooms/${roomId}$`));
  await expect(friend.getByText("Bạn đã vào Tối thứ Sáu")).toBeVisible();
  await friend.getByRole("button", { name: "Ngồi đây" }).first().click();
  await expect(friend.getByText("Đã ngồi ghế 2")).toBeVisible();

  // 3. Both open the table. Each seat came with the room's starting stack (100 big blinds), so
  // nobody waits for the owner.
  await owner.getByRole("link", { name: /Về bàn|Vào bàn/ }).first().click();
  await expect(owner).toHaveURL(new RegExp(`/rooms/${roomId}/table$`));
  await friend.goto(`/rooms/${roomId}/table`);
  const room = await api(owner, "GET", `/api/rooms/${roomId}/`);
  expect(room.room.starting_stack).toBe(100 * room.room.big_blind);

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
