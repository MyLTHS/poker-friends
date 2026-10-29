// C5: accessibility of the table and the room screens, checked by axe-core (WCAG 2 A/AA rules).
// Serious and critical findings fail the test; the rest are printed. Also checks by hand what
// axe cannot: the turn is announced in a live region and Tab reaches the action bar in order.

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { api, newGuest, phone, settled } from "./helpers";

const RUN = Date.now().toString(36).slice(-4);

async function audit(page: Page, where: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = result.violations.filter((v) => !bad.includes(v));
  if (minor.length) console.log(`${where}: minor`, minor.map((v) => `${v.id} (${v.nodes.length})`).join(", "));
  expect(
    bad.map((v) => ({ rule: v.id, impact: v.impact, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim()}`) })),
    `${where}: serious accessibility problems`,
  ).toEqual([]);
}

test("table and room screens: no serious axe findings; the turn is announced; Tab order", async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await newGuest(browser, `A11y${RUN}`, { viewport: { width: 1440, height: 900 } });
  const friend = await newGuest(browser, `Ban${RUN}`, { viewport: { width: 1440, height: 900 } });
  const detail = await api(owner.page, "POST", "/api/rooms/", { name: "Bàn trợ năng", max_seats: 6, small_blind: 10, big_blind: 20, think_time_seconds: 90, seven_deuce_bonus: 50 });
  const id = detail.room.room_id;
  await api(friend.page, "POST", "/api/rooms/join/", { invite_token: detail.invite_token });
  await api(owner.page, "POST", `/api/rooms/${id}/seats/`, { seat: 1 });
  await api(friend.page, "POST", `/api/rooms/${id}/seats/`, { seat: 4 });
  for (const p of [owner, friend]) await api(owner.page, "POST", `/api/rooms/${id}/chips/`, { player_id: p.id, amount: 1000 });

  // Desktop table, live hand: whoever is to act sees the action bar.
  await owner.page.goto(`/rooms/${id}/table`);
  await friend.page.goto(`/rooms/${id}/table`);
  for (const p of [owner.page, friend.page]) await expect(p.locator("[data-hand=live]")).toBeVisible();
  const turnPage = await expect
    .poll(async () => ((await owner.page.locator(".abar[aria-label='Tới lượt bạn']").count()) ? "owner" : (await friend.page.locator(".abar[aria-label='Tới lượt bạn']").count()) ? "friend" : ""))
    .not.toBe("")
    .then(async () => ((await owner.page.locator(".abar[aria-label='Tới lượt bạn']").count()) ? owner.page : friend.page));
  // the live region says it is my turn (screen readers hear it once)
  await expect(turnPage.getByRole("status").filter({ hasText: /^Tới lượt bạn\./ })).toHaveCount(1);
  await audit(turnPage, "bàn desktop, tới lượt");

  // Tab from the page start reaches the action buttons before the side panel's chat box.
  await turnPage.locator("body").focus();
  const order: string[] = [];
  for (let i = 0; i < 40 && order.length < 40; i++) {
    await turnPage.keyboard.press("Tab");
    order.push(await turnPage.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 20) ?? ""));
  }
  const fold = order.findIndex((t) => t.startsWith("Bỏ"));
  const chat = order.indexOf("Tin nhắn");
  expect(fold, `Tab order: ${order.join(" | ")}`).toBeGreaterThanOrEqual(0);
  expect(chat === -1 || fold < chat, `Tab order: ${order.join(" | ")}`).toBeTruthy();

  // The owner's sheet, settings and key help on the desktop table.
  await owner.page.getByRole("button", { name: "Bảng chủ phòng" }).click();
  await expect(owner.page.getByRole("dialog", { name: /Bảng chủ phòng/ })).toBeVisible();
  await settled(owner.page);
  await audit(owner.page, "bảng chủ phòng");
  await owner.page.keyboard.press("Escape");
  await owner.page.getByRole("button", { name: "Cài đặt bàn" }).click();
  await expect(owner.page.getByRole("dialog", { name: "Cài đặt bàn" })).toBeVisible();
  await settled(owner.page);
  await audit(owner.page, "cài đặt bàn");
  await owner.page.getByRole("button", { name: "Xem phím tắt" }).click();
  await expect(owner.page.getByRole("dialog", { name: "Phím tắt trên bàn" })).toBeVisible();
  await settled(owner.page);
  await audit(owner.page, "phím tắt");
  await owner.page.keyboard.press("Escape");

  // Single-key shortcuts can be switched off (WCAG 2.1.4), and the choice is kept on reload.
  await expect(owner.page.getByRole("dialog")).toHaveCount(0);
  await owner.page.getByRole("button", { name: "Cài đặt bàn" }).click();
  const keysSwitch = owner.page.getByRole("switch", { name: "Phím tắt một phím" });
  await expect(keysSwitch).toHaveAttribute("aria-checked", "true");
  await keysSwitch.click();
  await expect(keysSwitch).toHaveAttribute("aria-checked", "false");
  await owner.page.keyboard.press("Escape");
  await owner.page.reload();
  await expect(owner.page.locator("[data-hand]")).toBeVisible();
  await owner.page.keyboard.press("?");
  await expect(owner.page.getByRole("dialog", { name: "Phím tắt trên bàn" })).toBeHidden();
  await owner.page.getByRole("button", { name: "Cài đặt bàn" }).click();
  await expect(keysSwitch).toHaveAttribute("aria-checked", "false");
  await keysSwitch.click();
  await owner.page.keyboard.press("Escape");
  await owner.page.keyboard.press("?");
  await expect(owner.page.getByRole("dialog", { name: "Phím tắt trên bàn" })).toBeVisible();
  await owner.page.keyboard.press("Escape");

  // Phone table with the chat drawer open.
  const state = await owner.context.storageState();
  const mobile = await (await browser.newContext({ ...phone({ width: 844, height: 390 }), storageState: state })).newPage();
  await mobile.goto(`/rooms/${id}/table`);
  await expect(mobile.locator("[data-hand]")).toBeVisible();
  await audit(mobile, "bàn điện thoại");
  await mobile.getByRole("button", { name: /^Chat/ }).click();
  await settled(mobile);
  await audit(mobile, "ngăn chat điện thoại");
  await mobile.context().close();

  // Room screens (desktop).
  for (const path of ["/rooms", "/rooms/new", `/rooms/${id}/history`, "/rooms/join?token=khong-co-ma-nay-123"]) {
    await owner.page.goto(path);
    await owner.page.waitForLoadState("networkidle");
    await settled(owner.page); // entrance animations settle (contrast is read on the final colours)
    await audit(owner.page, path);
  }

  // The name gate a visitor with no account sees first (lobby, invite link, table).
  const stranger = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await stranger.goto("/rooms");
  await expect(stranger.getByRole("heading", { name: "Bạn tên gì?" })).toBeVisible();
  await settled(stranger);
  await audit(stranger, "cổng tên");
  await stranger.getByRole("button", { name: "Vào chơi" }).click(); // empty: the error under the box
  await expect(stranger.getByLabel("Tên ở bàn")).toHaveAttribute("aria-invalid", "true");
  await audit(stranger, "cổng tên báo lỗi");
  await stranger.context().close();

  await owner.context.close();
  await friend.context.close();
});
