// Table extras on the real server: "Chọn trước" (pre-actions) plays a whole heads-up hand to the
// showdown, the shown hand is named on the table, in the log and in the replay, and the replay
// steps to the hand before / after. Then the pre-actions on phones, the names of the room form's
// and the owner panel's controls, and axe on the replay. SHOTS=<dir> saves screenshots.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { PHONES, api, newGuest, outOfView, phone, settled, smallTargets } from "./helpers";

const RUN = Date.now().toString(36).slice(-4);
// not \b: JavaScript counts "ũ" and "ý" as non-word, so "Cù lũ K…" and "Tứ quý A…" never matched
const HAND = /^(Mậu thầu|Đôi|Hai đôi|Bộ ba|Sảnh|Thùng|Cù lũ|Tứ quý|Thùng phá sảnh)(?=\s|$)/;
const DESKTOP = { viewport: { width: 1440, height: 900 } };

const area = (page: Page) => page.locator("[data-hand]");
const myTurn = (page: Page) => page.locator(".abar[aria-label='Tới lượt bạn']");
const boardCards = (page: Page) => page.locator(".board [data-board]");

async function shot(page: Page, name: string) {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
}

/** Pick a pre-action on `page` and see it switched on. */
async function choose(page: Page, label: string) {
  const button = page.getByRole("button", { name: `Chọn trước: ${label}`, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function audit(page: Page, where: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => ({ rule: v.id, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")) })), `${where}: serious accessibility problems`).toEqual([]);
}

test("pre-actions play a hand to the showdown; the hand is named on the table and in the replay", async ({ browser }) => {
  test.setTimeout(360_000);
  const owner = await newGuest(browser, `Chu${RUN}`, DESKTOP);
  const friend = await newGuest(browser, `Ban${RUN}`, DESKTOP);
  const detail = await api(owner.page, "POST", "/api/rooms/", { name: "Bàn chọn trước", max_seats: 6, small_blind: 10, big_blind: 20, think_time_seconds: 90, seven_deuce_bonus: 0 });
  const id = detail.room.room_id;
  await api(friend.page, "POST", "/api/rooms/join/", { invite_token: detail.invite_token });
  await api(owner.page, "POST", `/api/rooms/${id}/seats/`, { seat: 1 });
  await api(friend.page, "POST", `/api/rooms/${id}/seats/`, { seat: 4 });
  for (const p of [owner, friend]) await api(owner.page, "POST", `/api/rooms/${id}/chips/`, { player_id: p.id, amount: 1000 });

  await owner.page.goto(`/rooms/${id}/table`);
  await friend.page.goto(`/rooms/${id}/table`);
  for (const p of [owner.page, friend.page]) await expect(area(p)).toHaveAttribute("data-hand", "live");
  await expect.poll(async () => (await myTurn(owner.page).count()) + (await myTurn(friend.page).count())).toBe(1);
  // Heads-up the button (small blind) acts first preflop, the big blind first after the flop.
  const [button, blind] = (await myTurn(owner.page).count()) ? [owner.page, friend.page] : [friend.page, owner.page];

  // Preflop: the big blind is not facing a bet, so every choice is open; "Theo bất kỳ" checks.
  await expect(blind.getByRole("group", { name: "Chọn trước khi tới lượt" })).toBeVisible();
  await expect(blind.getByRole("button", { name: "Chọn trước: Check", exact: true })).toBeEnabled();
  await choose(blind, "Theo bất kỳ");
  await shot(blind, "pre-desktop");
  await button.getByRole("button", { name: /^Theo/ }).click();
  for (const p of [button, blind]) await expect(boardCards(p)).toHaveCount(3);

  // Flop, turn, river: the big blind checks by hand, the button's choice answers at once.
  for (const [label, cards] of [["Check", 4], ["Check / Bỏ", 5], ["Check", null]] as const) {
    await expect(myTurn(blind)).toBeVisible();
    await choose(button, label);
    await blind.getByRole("button", { name: "Check", exact: true }).click();
    if (cards) for (const p of [button, blind]) await expect(boardCards(p)).toHaveCount(cards);
  }
  for (const p of [button, blind]) await expect(area(p)).toHaveAttribute("data-hand", "complete");
  await expect(myTurn(button)).toHaveCount(0);

  // The showdown: every shown hand has a name by its seat, the winner's in the banner, the log
  // says what was shown.
  for (const p of [button, blind]) {
    const names = await p.locator(".seat-hand, .me-hand").allTextContents();
    expect(names.length, "a showdown names at least the winner's hand").toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(HAND);
    // a best five uses at least three board cards, so the winner's always light some (a split pot too)
    await expect(p.locator(".board .pc.is-hi").first()).toBeVisible();
  }
  await shot(button, "showdown-desktop");
  await button.getByRole("tab", { name: /Nhật ký/ }).click();
  await expect(button.locator(".log li").filter({ hasText: /^Lật bài: .+ — / }).first()).toBeVisible();

  // The replay of that hand names it too; after a second hand it steps to it and back.
  const firstId = (await api(owner.page, "GET", `/api/rooms/${id}/hands/`)).hands[0].hand_id;
  await expect(area(owner.page)).toHaveAttribute("data-hand", "live", { timeout: 30_000 });
  const second = (await myTurn(owner.page).count()) ? owner.page : friend.page;
  await expect(myTurn(second)).toBeVisible();
  await second.getByRole("button", { name: /^Bỏ/ }).click();
  await expect(area(second)).toHaveAttribute("data-hand", "complete");
  const secondId = (await api(owner.page, "GET", `/api/rooms/${id}/hands/`)).hands[0].hand_id;
  expect(secondId).not.toBe(firstId);

  const replay = owner.page;
  await replay.goto(`/hands/${firstId}`);
  await replay.getByRole("button", { name: "Tới kết quả" }).click();
  await expect(replay.locator(".rp-result > b")).toContainText(" với ");
  await expect(replay.locator(".seat-hand, .me-hand").first()).toHaveText(HAND);
  await expect(replay.getByRole("link", { name: /Ván trước/ })).toHaveCount(0);
  await shot(replay, "replay-desktop");
  await audit(replay, "xem lại ván");
  await replay.getByRole("link", { name: /Ván sau/ }).click();
  await expect(replay).toHaveURL(new RegExp(`/hands/${secondId}$`));
  await expect(replay.getByRole("link", { name: /Ván sau/ })).toHaveCount(0);
  await expect(replay.getByRole("link", { name: /Ván trước/ })).toBeVisible(); // the hand list has loaded
  await replay.keyboard.press("Shift+ArrowLeft");
  await expect(replay).toHaveURL(new RegExp(`/hands/${firstId}$`));

  // Phones: the waiting player's choices fit every landscape phone, with 44px targets (same
  // guests: the server allows only 20 new guests an hour per address, and every spec makes some).
  await owner.page.goto(`/rooms/${id}/table`); // it was showing the replay
  await expect(area(owner.page)).toHaveAttribute("data-hand", "live", { timeout: 30_000 });
  await expect.poll(async () => (await myTurn(owner.page).count()) + (await myTurn(friend.page).count())).toBe(1);
  const waiting = (await myTurn(owner.page).count()) ? friend : owner;
  const state = await waiting.context.storageState();
  for (const size of PHONES) {
    const page = await (await browser.newContext({ ...phone(size), storageState: state })).newPage();
    await page.goto(`/rooms/${id}/table`);
    await expect(page.getByRole("group", { name: "Chọn trước khi tới lượt" })).toBeVisible();
    await choose(page, "Theo bất kỳ");
    await settled(page);
    expect(await outOfView(page, ".ppanel, .ppanel .pre"), `${size.name}: out of the screen`).toEqual([]);
    expect(await smallTargets(page), `${size.name}: under 44 px`).toEqual([]);
    await shot(page, `pre-phone-${size.width}`);
    await page.getByRole("button", { name: "Chọn trước: Theo bất kỳ", exact: true }).click(); // off again
    await page.context().close();
  }

  // The room form and the owner panel name their controls on the element itself, for tools that
  // read only an element's own text (desktop, then a phone with the owner's cookies).
  const ownerState = await owner.context.storageState();
  for (const [where, options] of [["desktop", DESKTOP], ["phone", phone({ width: 844, height: 390 })]] as const) {
    const page = await (await browser.newContext({ ...options, storageState: ownerState })).newPage();
    await page.goto("/rooms/new");
    await expect(page.getByRole("radio", { name: /Công khai/ })).toHaveAttribute("aria-label", /^Công khai/);
    await expect(page.getByRole("radio", { name: /Riêng/ })).toHaveAttribute("aria-label", /^Riêng/);
    if (where === "desktop") await expect(page.getByRole("link", { name: "Huỷ" })).toHaveAttribute("aria-label", "Huỷ"); // the phone goes back from its bar
    await expect(page.getByRole("button", { name: /Tạo phòng/ })).toHaveAttribute("aria-label", /^Tạo phòng/);
    await page.goto(`/rooms/${id}`);
    await page.getByRole("button", { name: "Bảng chủ phòng" }).click();
    await expect(page.getByRole("button", { name: "Đóng phòng" })).toHaveAttribute("aria-label", "Đóng phòng");
    await page.context().close();
  }

  await owner.context.close();
  await friend.context.close();
});
