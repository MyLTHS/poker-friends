// The owner's "Bắt đầu": a paused room deals nothing until the owner presses it, then deals (the
// E2E server counts down 1 s). "Rời phòng" during a hand waits for the hand to end, then the
// player is back in the lobby and the seat is free.
import { expect, test, type Page } from "@playwright/test";

import { api, newGuest } from "./helpers";

const RUN = Date.now().toString(36).slice(-5);
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const area = (page: Page) => page.locator("[data-hand]");
const myTurn = (page: Page) => page.getByRole("region", { name: "Tới lượt bạn" });

async function twoAtTable(browser: Parameters<typeof newGuest>[0], tag: string, pause: boolean) {
  const owner = await newGuest(browser, `Chu${tag}${RUN}`, DESKTOP);
  const friend = await newGuest(browser, `Ban${tag}${RUN}`, DESKTOP);
  const detail = await api(owner.page, "POST", "/api/rooms/", { name: `Bàn ${tag}`, small_blind: 10, big_blind: 20, think_time_seconds: 60 });
  const id: number = detail.room.room_id;
  if (pause) await api(owner.page, "POST", `/api/rooms/${id}/pause/`);
  await api(friend.page, "POST", "/api/rooms/join/", { invite_token: detail.invite_token });
  await api(owner.page, "POST", `/api/rooms/${id}/seats/`, { seat: 1 });
  await api(friend.page, "POST", `/api/rooms/${id}/seats/`, { seat: 4 });
  await owner.page.goto(`/rooms/${id}/table`);
  await friend.page.goto(`/rooms/${id}/table`);
  return { owner, friend, id };
}

test("the owner starts a paused room, and pauses it after the hand", async ({ browser }) => {
  const { owner, friend, id } = await twoAtTable(browser, "batdau", true);

  // Nothing is dealt: the owner has the button, the friend waits for it.
  await expect(friend.page.getByRole("status").filter({ hasText: "Chờ chủ phòng bắt đầu" })).toBeVisible();
  for (const p of [owner.page, friend.page]) await expect(area(p)).toHaveAttribute("data-hand", "none");
  const start = owner.page.getByRole("button", { name: "Bắt đầu", exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  for (const p of [owner.page, friend.page]) await expect(area(p)).toHaveAttribute("data-hand", "live");

  // The owner's menu stops the table once this hand is over.
  await owner.page.getByRole("button", { name: "Menu", exact: true }).click();
  await owner.page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Tạm dừng (hết ván này)" }).click();
  await expect.poll(async () => (await api(owner.page, "GET", `/api/rooms/${id}/`)).room.running).toBe(false);
  await owner.context.close();
  await friend.context.close();
});

test("leaving the room during a hand waits for its end, then back to the lobby", async ({ browser }) => {
  const { owner, friend, id } = await twoAtTable(browser, "roi", false);
  for (const p of [owner.page, friend.page]) await expect(area(p)).toHaveAttribute("data-hand", "live");

  // The friend asks to leave: still dealt in, said on the felt, the seat marked for everyone.
  await friend.page.getByRole("button", { name: "Menu", exact: true }).click();
  await friend.page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Rời phòng · sau ván này" }).click();
  await expect(friend.page.getByRole("status").filter({ hasText: "Bạn sẽ rời phòng" })).toBeVisible();
  await expect.poll(async () => (await api(owner.page, "GET", `/api/rooms/${id}/snapshot/`)).table.seats.find((s: { seat: number }) => s.seat === 4)?.leaving).toBe(true);

  // Whoever acts folds: the hand ends, the friend lands in the lobby and the seat is free.
  await expect.poll(async () => (await myTurn(owner.page).count()) + (await myTurn(friend.page).count())).toBe(1);
  const actor = (await myTurn(owner.page).count()) ? owner.page : friend.page;
  await actor.getByRole("button", { name: "Bỏ", exact: true }).click();
  await expect(friend.page).toHaveURL(/\/rooms$/);
  await expect.poll(async () => (await api(owner.page, "GET", `/api/rooms/${id}/snapshot/`)).table.seats.map((s: { seat: number }) => s.seat)).toEqual([1]);
  await owner.context.close();
  await friend.context.close();
});
