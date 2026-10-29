// C5: the landscape phone. Tables of 2 to 9 seats and every room screen, at 844×390, 932×430 and
// 667×375 (iPhone SE): every seat, bet, the right column, the chat drawer and the owner's sheet
// stay on screen, nothing scrolls sideways, and every control is at least 44 px to tap.

import { expect, test, type Page } from "@playwright/test";

import { PHONES, api, checkOrCallWithKey, newGuest, outOfView, pageWidth, phone, readyToAct, settled, smallTargets, watchActions, type Applied } from "./helpers";

/** Guest names are unique: a suffix lets the spec run again on the same database. */
const RUN = Date.now().toString(36).slice(-4);

/** What has to stay inside the screen on the table. */
const TABLE_PARTS = [
  ".seat",
  ".me",
  ".bet",
  ".pot",
  ".board",
  ".turn-hint",
  ".win-banner",
  ".tbar-m",
  ".tbar-m-right > *",
  ".ppanel",
  ".ppanel button",
  ".ppanel input",
  ".chat-drawer.is-open",
  ".chat-drawer.is-open button",
  ".chat-drawer.is-open input",
  "dialog[open] .sheet-panel",
  "dialog[open] .overlay-card",
  "dialog[open] button",
].join(", ");

async function expectFits(page: Page, where: string) {
  expect(await outOfView(page, TABLE_PARTS), `${where}: out of the screen`).toEqual([]);
  expect(await smallTargets(page), `${where}: under 44 px`).toEqual([]);
}

test("phone: tables of 2–9 seats, the chat drawer and the owner's sheet fit every landscape phone", async ({ browser }) => {
  test.setTimeout(420_000);
  const owner = await newGuest(browser, `Chu${RUN}`);
  const friend = await newGuest(browser, `Ban${RUN}`);
  const rooms: number[] = [];
  for (let seats = 2; seats <= 9; seats++) {
    const detail = await api(owner.page, "POST", "/api/rooms/", { name: `Ngang ${seats} ghế`, max_seats: seats, small_blind: 10, big_blind: 20, think_time_seconds: 60, is_private: true, starting_stack: 1000 });
    const id = detail.room.room_id;
    await api(friend.page, "POST", "/api/rooms/join/", { invite_token: detail.invite_token });
    await api(owner.page, "POST", `/api/rooms/${id}/seats/`, { seat: 1 });
    await api(friend.page, "POST", `/api/rooms/${id}/seats/`, { seat: seats });
    rooms.push(id);
  }
  const state = await owner.context.storageState();

  // One table per phone size (9, 6 and 3 seats) is brought to the owner's turn, so the phone's
  // action panel is measured too: the friend checks/calls from a desktop page until it is.
  const turnRooms = [7, 4, 1].map((i) => ({ id: rooms[i], seat: i + 2 }));
  const friendTables: { page: Page; seen: Applied[] }[] = [];
  for (const r of turnRooms) {
    const page = await friend.context.newPage();
    const seen = watchActions(page);
    await page.goto(`/rooms/${r.id}/table`);
    await expect(page.locator("[data-hand]")).toBeVisible();
    friendTables.push({ page, seen });
  }

  for (const [n, size] of PHONES.entries()) {
    const context = await browser.newContext({ ...phone(size), storageState: state });
    const page = await context.newPage();
    for (const [i, id] of rooms.entries()) {
      const where = `${size.name}, ${i + 2} ghế`;
      await page.goto(`/rooms/${id}/table`);
      await expect(page.locator("[data-hand=live]")).toBeVisible();
      await expect(page.locator(".seat, .me")).toHaveCount(i + 2);
      await expectFits(page, where);
    }
    // My turn: the action panel (clock, sizes, slider, Fold/Call/Raise) fits too.
    const turnRoom = turnRooms[n];
    const other = friendTables[n];
    await page.goto(`/rooms/${turnRoom.id}/table`);
    await expect
      .poll(
        async () => {
          if (await page.locator(".tpanel .act-call").isVisible()) return true;
          if (await readyToAct(other.page)) await checkOrCallWithKey(other.page, other.seen, turnRoom.seat);
          return false;
        },
        { timeout: 90_000, intervals: [500] },
      )
      .toBe(true);
    await settled(page);
    await expect(page.locator(".tpanel .act-fold, .tpanel .act-call").first()).toBeVisible();
    await expectFits(page, `${size.name}, ${turnRoom.seat} ghế, tới lượt mình`);
    // The closed chat drawer sits past the right edge: the table must not be scrollable sideways,
    // or moving focus to the bar on your turn slides the whole table off the screen.
    const slid = await page.locator(".d1.tbl").evaluate((el) => {
      el.scrollLeft = 300;
      return el.scrollLeft;
    });
    expect(slid, `${size.name}: the table scrolls sideways`).toBe(0);
    await page.goto(`/rooms/${rooms[7]}/table`);
    await expect(page.locator("[data-hand]")).toBeVisible();
    // On the 9-seat table: the chat drawer, the settings and the owner's sheet.
    await page.getByRole("button", { name: /^Chat/ }).click();
    await expect(page.getByRole("dialog", { name: "Chat và người xem" })).toBeVisible();
    await settled(page); // the drawer slides in
    await expectFits(page, `${size.name}, chat`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Thêm tuỳ chọn" }).click();
    await expect(page.getByRole("dialog", { name: "Cài đặt bàn" })).toBeVisible();
    await settled(page);
    await expectFits(page, `${size.name}, cài đặt`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Bảng chủ phòng" }).click();
    await expect(page.getByRole("dialog", { name: /Bảng chủ phòng/ })).toBeVisible();
    await settled(page);
    await expectFits(page, `${size.name}, bảng chủ phòng`);
    await context.close();
  }

  // Play the 2-seat hand out (whoever is to act folds) so the history and replay have a hand.
  const friendTable = await friend.context.newPage();
  await friendTable.goto(`/rooms/${rooms[0]}/table`);
  const ownerTable = owner.page;
  await ownerTable.goto(`/rooms/${rooms[0]}/table`);
  const fold = async (p: Page) => p.locator(".act-fold").click({ timeout: 2000 }).then(() => true, () => false);
  await expect.poll(async () => (await fold(ownerTable)) || (await fold(friendTable)), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await api(owner.page, "GET", `/api/rooms/${rooms[0]}/hands/`)).hands.length).toBeGreaterThan(0);
  const handId = (await api(owner.page, "GET", `/api/rooms/${rooms[0]}/hands/`)).hands[0].hand_id;

  // The room screens: scroll down if they must, never sideways; controls 44 px.
  const screens = ["/rooms", "/rooms/new", `/rooms/${rooms[0]}`, `/rooms/${rooms[0]}/history`, `/hands/${handId}`, "/rooms/join?token=khong-co-ma-nay-123"];
  for (const size of PHONES) {
    const context = await browser.newContext({ ...phone(size), storageState: state });
    const page = await context.newPage();
    for (const path of screens) {
      const where = `${size.name}, ${path}`;
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".d1").first()).toBeVisible();
      await settled(page);
      const width = await pageWidth(page);
      expect(width.scroll, `${where}: scrolls sideways`).toBeLessThanOrEqual(width.view);
      expect(await outOfView(page, "button, a[href], input, .panel, .m-card, .room-card, .room-row, .sheet-panel", true), `${where}: out of the screen`).toEqual([]);
      const small = await smallTargets(page);
      // SHOTS=<folder>: keep a picture of each screen as measured
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${size.width}-${path.replace(/\W+/g, "_")}.png` });
      expect(small, `${where}: under 44 px`).toEqual([]);
    }
    await context.close();
  }

  for (const t of friendTables) await t.page.close();
  await owner.context.close();
  await friend.context.close();
});
