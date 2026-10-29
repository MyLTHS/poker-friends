// C4: the room screens on the real server, as plain as Poker Now. Lan opens a table from the
// lobby and lands at it with the invite link; Bình (a new visitor, not logged in) opens the link,
// says a name, sits down (with the room's starting stack), and Lan grants more chips from the
// owner's panel on the table.

import { expect, test, type Browser, type Page } from "@playwright/test";

const WEB = process.env.E2E_WEB ?? "http://localhost:3100";

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

test("lobby → create a table → at it with the invite link → a new visitor names themselves, joins and sits; the owner grants chips", async ({ browser }) => {
  // names differ from table.spec.ts: both files share one database per run
  const an = await newGuest(browser, "Lan");

  // The lobby: a title, one "Tạo bàn" button and the rooms (no search, filters or paste box).
  await an.goto("/rooms");
  await expect(an.getByRole("heading", { name: "Chọn một bàn" })).toBeVisible();
  await expect(an.getByRole("searchbox")).toHaveCount(0);
  await expect(an.getByRole("tablist")).toHaveCount(0);
  await expect(an.getByPlaceholder("Dán link mời…")).toHaveCount(0);
  await an.getByRole("link", { name: "Tạo bàn" }).first().click();

  // The create form: the name is filled in, the extra options wait closed, no preview.
  await expect(an).toHaveURL(/\/rooms\/new$/);
  await expect(an.getByLabel("Tên bàn")).toHaveValue("Bàn của Lan");
  await expect(an.getByRole("textbox", { name: "Blind nhỏ", exact: true })).toHaveValue("10");
  await expect(an.getByRole("textbox", { name: "Blind lớn", exact: true })).toHaveValue("20");
  // "Chip đầu vào" follows the big blind (100 of them) until it is typed in.
  const stack = an.getByRole("textbox", { name: "Chip đầu vào" });
  const big = an.getByRole("textbox", { name: "Blind lớn", exact: true });
  await expect(stack).toHaveValue("2000");
  await big.fill("50");
  await expect(stack).toHaveValue("5000");
  await stack.fill("2000");
  await big.fill("20");
  await expect(stack).toHaveValue("2000");
  await expect(an.locator(".create-preview")).toHaveCount(0);
  await expect(an.getByRole("radio", { name: "6", exact: true })).toBeHidden();
  await an.getByLabel("Tên bàn").fill("Bàn E2E C4");
  await an.getByText("Thêm tuỳ chọn").click();
  await an.getByRole("radio", { name: "6", exact: true }).click();
  // A new room has no 7-2 bonus and is public unless chosen; this one is made private.
  await expect(an.getByRole("switch", { name: "Bật thưởng 7-2" })).toHaveAttribute("aria-checked", "false");
  await expect(an.getByRole("textbox", { name: "Thưởng 7-2 mỗi người" })).toHaveCount(0);
  await expect(an.getByRole("radio", { name: /Công khai/ })).toBeChecked();
  await an.getByRole("radio", { name: /Riêng/ }).click();
  await an.getByRole("button", { name: "Tạo bàn" }).click();

  // Straight to the table, the "Mời bạn" sheet open with the invite link and its QR; the ?moi=1
  // leaves the address bar, so a reload does not open the sheet again.
  await expect(an).toHaveURL(/\/rooms\/\d+\/table$/);
  const roomId = Number(new URL(an.url()).pathname.split("/")[2]);
  const created = an.getByRole("dialog", { name: "Mời bạn vào bàn" });
  await expect(created.getByRole("img", { name: /Mã QR của link mời/ })).toBeVisible();
  const shown = await created.getByTestId("invite-link").getAttribute("title");
  expect(shown).toMatch(/\/rooms\/join\?token=[\w-]+$/);
  const invite = new URL(shown!);
  expect(await api(an, "GET", `/api/rooms/${roomId}/`)).toMatchObject({ is_private: true, room: { max_seats: 6, starting_stack: 2000, seven_deuce_bonus: 0 } });
  await an.reload();
  await expect(an.locator("[data-hand]")).toBeVisible();
  await expect(created).toBeHidden();

  // A visitor with no account opens the link: a name first (one already used is refused under
  // the box), then the table replaces the link (the token leaves the address bar and the history).
  const binh = await (await browser.newContext()).newPage();
  await binh.goto(invite.pathname + invite.search);
  await expect(binh.getByRole("heading", { name: "Bạn tên gì?" })).toBeVisible();
  await expect(binh.getByRole("region", { name: "Bạn tên gì?" }).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", `/account?next=${encodeURIComponent(invite.pathname + invite.search)}`);
  const name = binh.getByLabel("Tên ở bàn");
  await name.fill("lan");
  await binh.getByRole("button", { name: "Vào chơi" }).click();
  await expect(name).toHaveAccessibleDescription("Tên này đã có người dùng, chọn tên khác.");
  await name.fill("Bình");
  await binh.getByRole("button", { name: "Vào chơi" }).click();
  await expect(binh).toHaveURL(new RegExp(`/rooms/${roomId}/table$`));
  expect((await api(binh, "GET", "/api/auth/me/")).username).toBe("Bình");
  await binh.getByRole("button", { name: "Ngồi vào ghế 1" }).click();
  await expect.poll(async () => (await api(an, "GET", `/api/rooms/${roomId}/snapshot/`)).table.seats.map((s: { seat: number }) => s.seat)).toEqual([1]);

  // Bình sat down with the starting stack (100 big blinds of the form's 10/20: 2.000); the owner's
  // panel on the table grants 500 more.
  await an.getByRole("button", { name: "Menu", exact: true }).click();
  await an.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Bảng chủ phòng" }).click();
  const sheet = an.getByRole("dialog", { name: /Bảng chủ phòng/ });
  const row = sheet.getByRole("listitem").filter({ hasText: /Ghế 1/ });
  await row.getByRole("button", { name: "Cấp/trừ" }).click();
  await row.getByRole("button", { name: "Cấp 500" }).click();
  await expect(an.getByText(/Đã cấp 500 chip cho/)).toBeVisible();
  await expect(row.locator(".op-stack")).toHaveText("2.500");
  const seats = await api(an, "GET", `/api/rooms/${roomId}/snapshot/`);
  expect(seats.table.seats[0].stack).toBe(2500);
  await an.keyboard.press("Escape");

  // "Mời bạn" gives the owner the same invite link again. Bình is not the owner of this private
  // room, so the server keeps the link from them and the sheet says to ask Lan.
  await an.getByRole("button", { name: "Mời bạn" }).click();
  const ownerInvite = an.getByRole("dialog", { name: "Mời bạn vào bàn" });
  await expect(ownerInvite.getByTestId("invite-link")).toHaveAttribute("title", shown!);
  await binh.getByRole("button", { name: "Mời bạn" }).click();
  const guestInvite = binh.getByRole("dialog", { name: "Mời bạn vào bàn" });
  await expect(guestInvite).toContainText("chỉ chủ phòng có link mời");
  await expect(guestInvite.getByTestId("invite-link")).toHaveCount(0);
});

test("at the table of a public room anyone may pass on the room's page", async ({ browser }) => {
  const owner = await newGuest(browser, "Hoa");
  const room = await api(owner, "POST", "/api/rooms/", { name: "Bàn E2E công khai", small_blind: 10, big_blind: 20, is_private: false });
  const roomId = room.room.room_id;
  const khai = await newGuest(browser, "Khải");
  await khai.goto(`/rooms/${roomId}/table`);
  await khai.getByRole("button", { name: "Mời bạn" }).click();
  const sheet = khai.getByRole("dialog", { name: "Mời bạn vào bàn" });
  await expect(sheet.getByTestId("invite-link")).toHaveAttribute("title", new RegExp(`/rooms/${roomId}/table$`));
  await expect(sheet).toContainText("Link phòng công khai");

  // Someone with no account opens that link: the name first, then the table (no random name).
  const quang = await (await browser.newContext()).newPage();
  await quang.goto(`/rooms/${roomId}/table`);
  await expect(quang.getByRole("heading", { name: "Bạn tên gì?" })).toBeVisible();
  await quang.getByLabel("Tên ở bàn").fill("Quang");
  await quang.getByRole("button", { name: "Vào chơi" }).click();
  await expect(quang.getByRole("button", { name: "Mời bạn" })).toBeVisible();
  expect((await api(quang, "GET", "/api/auth/me/")).username).toBe("Quang");
});

test("the old room address and the lobby: the room address opens its table; a visitor names themselves first", async ({ browser }) => {
  const owner = await newGuest(browser, "Tuan");
  const room = await api(owner, "POST", "/api/rooms/", { name: "Bàn E2E địa chỉ cũ", small_blind: 10, big_blind: 20, is_private: false });
  const roomId = room.room.room_id;
  await owner.goto(`/rooms/${roomId}`);
  await expect(owner).toHaveURL(new RegExp(`/rooms/${roomId}/table$`));

  // The lobby asks a newcomer's name before anything (no guest is made behind their back).
  const page = await (await browser.newContext()).newPage();
  await page.goto("/rooms");
  await expect(page.getByRole("heading", { name: "Bạn tên gì?" })).toBeVisible();
  await expect(page.getByLabel("Tên ở bàn")).toBeFocused();
  await expect(page.getByRole("region", { name: "Bạn tên gì?" }).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/account?next=%2Frooms");
  await page.getByLabel("Tên ở bàn").fill("Vy");
  await page.getByRole("button", { name: "Vào chơi" }).click();
  await expect(page.getByRole("heading", { name: "Chọn một bàn" })).toBeVisible();
  // the room cards open the table
  const card = page.getByRole("link", { name: /Bàn E2E địa chỉ cũ/ });
  await expect(card).toHaveAttribute("href", `/rooms/${roomId}/table`);
});

test("a wrong invite link says so and leads back to the lobby", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/rooms/join?token=khong-co-ma-nay-123");
  await page.getByLabel("Tên ở bàn").fill("Lạc");
  await page.getByRole("button", { name: "Vào chơi" }).click();
  await expect(page.getByText("Link mời không dùng được")).toBeVisible();
  await page.getByRole("link", { name: "Về sảnh" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
});

test("out of chips: any seated player buys back in with \"Mua thêm\"; the owner's self-grant button is gone", async ({ browser }) => {
  const owner = await newGuest(browser, "Minh");
  const room = await api(owner, "POST", "/api/rooms/", { name: "Bàn E2E mua thêm", small_blind: 10, big_blind: 20, starting_stack: 800 });
  const roomId = room.room.room_id;
  const stackAt = async (seat: number) => (await api(owner, "GET", `/api/rooms/${roomId}/snapshot/`)).table.seats.find((s: { seat: number }) => s.seat === seat)?.stack;
  // The owner sits (the chips come with the seat) and loses them all before anyone else sits, so
  // no hand starts while the test sets up.
  const mine = await api(owner, "POST", `/api/rooms/${roomId}/seats/`, { seat: 1 });
  expect(mine.stack).toBe(800);
  await api(owner, "POST", `/api/rooms/${roomId}/chips/`, { player_id: mine.player_id, amount: -800 });

  const nga = await newGuest(browser, "Nga");
  await api(nga, "POST", "/api/rooms/join/", { invite_token: room.invite_token });
  const seated = await api(nga, "POST", `/api/rooms/${roomId}/seats/`, { seat: 2 });
  expect(seated.stack).toBe(800);
  // Still has chips: the server refuses a rebuy.
  const csrf = (await nga.context().cookies(WEB)).find((c) => c.name === "csrftoken")?.value ?? "";
  const early = await nga.request.post(`${WEB}/api/rooms/${roomId}/rebuy/`, { headers: { "X-CSRFToken": csrf, Referer: `${WEB}/`, Origin: WEB }, failOnStatusCode: false });
  expect(early.status()).toBe(409);
  expect(await early.json()).toMatchObject({ code: "has_chips" });

  // Nga loses it all too (as if busted): the bar says so and offers "Mua thêm"; one tap gives the
  // starting stack back.
  await api(owner, "POST", `/api/rooms/${roomId}/chips/`, { player_id: seated.player_id, amount: -800 });
  await nga.goto(`/rooms/${roomId}/table`);
  await expect(nga.getByText("Hết chip — bấm Mua thêm").first()).toBeVisible();
  await expect(nga.getByText(/nhờ chủ phòng/)).toHaveCount(0);
  await nga.getByRole("button", { name: "Mua thêm" }).click();
  await expect.poll(() => stackAt(2)).toBe(800);
  await expect(nga.getByRole("button", { name: "Mua thêm" })).toHaveCount(0);

  // The owner gets the same button, not "Cấp chip cho mình". Two players with chips: the hand
  // deals at once, so the owner's stack is 800 less a blind.
  await owner.goto(`/rooms/${roomId}/table`);
  await expect(owner.getByRole("button", { name: "Mua thêm" })).toBeVisible();
  await expect(owner.getByRole("button", { name: "Cấp chip cho mình" })).toHaveCount(0);
  await owner.getByRole("button", { name: "Mua thêm" }).click();
  await expect.poll(() => stackAt(1)).toBeGreaterThanOrEqual(780);
  await expect(owner.getByRole("button", { name: "Mua thêm" })).toHaveCount(0);
});

test("house rules: the create form sends an ante and a bomb pot every hand; the table shows the bomb pot, its pot and then the antes", async ({ browser }) => {
  // names differ from the other specs: they all share one database per run
  const owner = await newGuest(browser, "Phượng");

  // The create form: ante and bomb pot wait under "Thêm tuỳ chọn", both off.
  await owner.goto("/rooms/new");
  await owner.getByLabel("Tên bàn").fill("Bàn E2E bomb pot");
  const big = owner.getByRole("textbox", { name: "Blind lớn", exact: true });
  await owner.getByRole("textbox", { name: "Blind nhỏ", exact: true }).fill("5");
  await big.fill("10");
  await owner.getByRole("textbox", { name: "Chip đầu vào" }).fill("1000");
  await owner.getByText("Thêm tuỳ chọn").click();
  const ante = owner.getByRole("textbox", { name: /^Ante/ });
  await expect(ante).toHaveValue("0");
  const bombSwitch = owner.getByRole("switch", { name: "Bật bomb pot" });
  await expect(bombSwitch).toHaveAttribute("aria-checked", "false");
  await expect(owner.getByRole("textbox", { name: "Mỗi người góp" })).toHaveCount(0);
  await ante.fill("2");
  // Switched on: every 5 hands, 2 big blinds each, following the big blind until typed in.
  await bombSwitch.click();
  const every = owner.getByRole("textbox", { name: "Cứ mấy ván một lần" });
  const amount = owner.getByRole("textbox", { name: "Mỗi người góp" });
  await expect(every).toHaveValue("5");
  await expect(amount).toHaveValue("20");
  await big.fill("20");
  await expect(amount).toHaveValue("40");
  await big.fill("10");
  await expect(amount).toHaveValue("20");
  // 0 is not "every 0 hands": the form says so before sending
  await every.fill("0");
  await owner.getByRole("button", { name: "Tạo bàn" }).click();
  await expect(every).toHaveAccessibleDescription("Từ 1 đến 1.000 ván.");
  await every.fill("1");
  await amount.fill("30");
  await owner.getByRole("button", { name: "Tạo bàn" }).click();
  await expect(owner).toHaveURL(/\/rooms\/\d+\/table$/);
  const roomId = Number(new URL(owner.url()).pathname.split("/")[2]);
  const detail = await api(owner, "GET", `/api/rooms/${roomId}/`);
  expect(detail.room).toMatchObject({ small_blind: 5, big_blind: 10, starting_stack: 1000, ante: 2, bomb_pot_every: 1, bomb_pot_amount: 30 });
  await owner.keyboard.press("Escape"); // the "Mời bạn" sheet

  // Two players sit: hand #1 is a bomb pot (every hand is). Everyone put 30 in (no ante on top),
  // there are no blinds, and the flop is out at once.
  const quynh = await newGuest(browser, "Quỳnh");
  if (detail.invite_token) await api(quynh, "POST", "/api/rooms/join/", { invite_token: detail.invite_token });
  await api(owner, "POST", `/api/rooms/${roomId}/seats/`, { seat: 1 });
  await api(quynh, "POST", `/api/rooms/${roomId}/seats/`, { seat: 2 });
  await quynh.goto(`/rooms/${roomId}/table`);
  for (const page of [owner, quynh]) {
    await expect(page.locator("[data-hand=live]")).toBeVisible();
    await expect(page.locator(".felt-badge")).toHaveText(/Bomb pot/);
    await expect(page.locator("[data-pot] .pot-pill b")).toHaveText("60");
    await expect(page.locator(".board [role=img]")).toHaveCount(3);
  }
  await expect(owner.locator(".tbl-desktop").getByText("Ante 2", { exact: true })).toBeVisible();

  // Play it out: whoever is to act folds, or checks when that is all there is (nothing to call on
  // the flop of a bomb pot). Between hands the bar says the next hand is a bomb pot too.
  const playOut = async () => {
    for (let i = 0; i < 40 && !(await owner.locator("[data-hand=complete]").count()); i++) {
      for (const p of [owner, quynh]) await p.locator(".act-fold, .act-call").first().click({ timeout: 1000 }).catch(() => {});
    }
    await expect(owner.locator("[data-hand=complete]")).toBeVisible();
  };
  await playOut();
  await expect(owner.getByText("Ván sau là bomb pot…")).toBeVisible();

  // Hand #2 (a bomb pot again): the owner switches bomb pots off; the panel says it waits for the
  // next hand.
  await expect(owner.locator("[data-hand=live]")).toBeVisible({ timeout: 20_000 });
  await expect(owner.locator(".felt-badge")).toBeVisible();
  await owner.getByRole("button", { name: "Menu", exact: true }).click();
  await owner.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Bảng chủ phòng" }).click();
  const sheet = owner.getByRole("dialog", { name: /Bảng chủ phòng/ });
  await expect(sheet.getByRole("textbox", { name: "Bomb pot cứ mấy ván một lần" })).toHaveValue("1");
  await expect(sheet.getByRole("textbox", { name: "Bomb pot mỗi người góp" })).toHaveValue("30");
  await sheet.getByRole("switch", { name: "Bật bomb pot" }).click();
  await sheet.getByRole("button", { name: "Lưu luật" }).click();
  await expect(sheet.getByText("Ván sau: tắt bomb pot")).toBeVisible();
  await owner.keyboard.press("Escape");
  await playOut();

  // Hand #3: a normal hand. Both antes (2 each) are in the pot; the blinds are still bets.
  await expect.poll(async () => (await api(owner, "GET", `/api/rooms/${roomId}/snapshot/`)).table.hand?.hand_no, { timeout: 20_000 }).toBe(3);
  await expect(owner.locator("[data-hand=live]")).toBeVisible();
  await expect(owner.locator(".felt-badge")).toHaveCount(0);
  await expect(owner.locator("[data-pot] .pot-pill b")).toHaveText("4");
  await expect(owner.locator(".board [role=img]")).toHaveCount(0);
  expect((await api(owner, "GET", `/api/rooms/${roomId}/`)).room).toMatchObject({ ante: 2, bomb_pot_every: 0 });
});

test("house rules 2: run it twice on an all-in preflop, then rabbit cards after a fold and 'Ngửa bài' for the folder", async ({ browser }) => {
  // unique names: every spec shares one database per run, and this one may run again on it
  const run = Date.now().toString(36).slice(-4);
  const owner = await newGuest(browser, `Tùng${run}`);
  const ownerName = `Tùng${run}`;
  const guestName = `Vy${run}`;

  // The create form: "Chạy 2 lần khi all-in" (off) and the rabbit hunt (on) under "Thêm tuỳ chọn".
  await owner.goto("/rooms/new");
  await owner.getByLabel("Tên bàn").fill("Bàn E2E chạy 2 lần");
  await owner.getByRole("textbox", { name: "Blind nhỏ", exact: true }).fill("5");
  await owner.getByRole("textbox", { name: "Blind lớn", exact: true }).fill("10");
  await owner.getByRole("textbox", { name: "Chip đầu vào" }).fill("1000");
  await owner.getByText("Thêm tuỳ chọn").click();
  const twice = owner.getByRole("switch", { name: "Chạy 2 lần khi all-in" });
  const rabbit = owner.getByRole("switch", { name: "Xem bài chưa chia (rabbit hunt)" });
  await expect(twice).toHaveAttribute("aria-checked", "false");
  await expect(rabbit).toHaveAttribute("aria-checked", "true");
  await twice.click();
  await owner.getByRole("button", { name: "Tạo bàn" }).click();
  await expect(owner).toHaveURL(/\/rooms\/\d+\/table/);
  const roomId = Number(new URL(owner.url()).pathname.split("/")[2]);
  const detail = await api(owner, "GET", `/api/rooms/${roomId}/`);
  expect(detail.room).toMatchObject({ run_it_twice: true, rabbit_hunt: true, starting_stack: 1000 });
  // the "Mời bạn" sheet opens with the new table: closed once it is there, or it covers the bar
  await expect(owner.locator("dialog[open]")).toBeVisible();
  await owner.keyboard.press("Escape");
  await expect(owner.locator("dialog[open]")).toHaveCount(0);

  const guest = await newGuest(browser, guestName);
  if (detail.invite_token) await api(guest, "POST", "/api/rooms/join/", { invite_token: detail.invite_token });
  await api(owner, "POST", `/api/rooms/${roomId}/seats/`, { seat: 1 });
  await api(guest, "POST", `/api/rooms/${roomId}/seats/`, { seat: 2 });
  await guest.goto(`/rooms/${roomId}/table`);
  const pages = [owner, guest];
  const other = (p: Page) => (p === owner ? guest : owner);
  const ready = async (p: Page) => (await p.locator("[data-hand=live]").count()) > 0 && (await p.getByRole("region", { name: "Tới lượt bạn" }).locator(".act-call:enabled").count()) > 0;
  const whoActs = async () => {
    let actor: Page | null = null;
    await expect
      .poll(
        async () => {
          for (const p of pages) if (await ready(p)) actor = p;
          return actor !== null;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    return actor! as Page;
  };

  // Hand #1: the first to act goes all in, the other calls. The board is dealt twice.
  const first = await whoActs();
  const bar = first.getByRole("region", { name: "Tới lượt bạn" });
  await bar.locator(".preset", { hasText: "All-in" }).click();
  await bar.locator(".act-raise").click();
  const second = other(first);
  await expect.poll(() => ready(second), { timeout: 20_000 }).toBe(true);
  await second.getByRole("region", { name: "Tới lượt bạn" }).locator(".act-call").click();
  for (const p of pages) {
    await expect(p.locator("[data-hand=complete]")).toBeVisible();
    const rows = p.locator(".board-twice .board-run");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".board-run-cards [role=img]")).toHaveCount(5);
    await expect(rows.nth(1).locator(".board-run-cards [role=img]")).toHaveCount(5);
    await expect(rows.nth(0).locator(".board-run-label")).toHaveText("Lần 1");
    await expect(rows.nth(1).locator(".board-run-label")).toHaveText("Lần 2");
    await expect(p.locator(".win-banner")).toContainText("Chạy 2 lần");
  }
  // Each board paid half of the pot of 2.000; each stack is what its owner won on the two boards.
  const hand1 = (await api(owner, "GET", `/api/rooms/${roomId}/hands/`)).hands[0];
  const replay1 = await api(owner, "GET", `/api/hands/${hand1.hand_id}/replay/`);
  type Paid = { player_id: string; seat: number; amount: number };
  const runouts = replay1.runouts as { board: string[]; winners: Paid[] }[];
  expect(runouts).toHaveLength(2);
  for (const r of runouts) expect(r.board).toHaveLength(5);
  const seats = (await api(owner, "GET", `/api/rooms/${roomId}/snapshot/`)).table.seats as { seat: number; player_id: string; stack: number }[];
  expect(seats.reduce((sum, s) => sum + s.stack, 0)).toBe(2000);
  const results = replay1.results as { player_id: string; hand_net: number }[];
  for (const s of seats) expect(s.stack).toBe(1000 + results.find((r) => r.player_id === s.player_id)!.hand_net);
  if (runouts.every((r) => r.winners.length)) {
    for (const r of runouts) expect(r.winners.reduce((sum, w) => sum + w.amount, 0)).toBe(1000);
    const won = (seat: number) => runouts.flatMap((r) => r.winners).filter((w) => w.seat === seat).reduce((sum, w) => sum + w.amount, 0);
    for (const s of seats) expect(s.stack).toBe(won(s.seat));
  } else {
    // one player took both boards (the other mucked): the server names no board winners then
    expect(seats.map((s) => s.stack).sort()).toEqual([0, 2000]);
    const name = seats.find((s) => s.stack === 2000)!.seat === 1 ? ownerName : guestName;
    for (const p of pages) await expect(p.locator(".board-run-win").first()).toHaveText(name);
  }
  const fmtChips = (n: number) => n.toLocaleString("de-DE");
  await expect(owner.locator(".me .stack")).toHaveText(fmtChips(seats.find((s) => s.seat === 1)!.stack));
  await expect(guest.locator(".me .stack")).toHaveText(fmtChips(seats.find((s) => s.seat === 2)!.stack));
  // The log says so, board by board.
  await owner.getByRole("button", { name: "Menu", exact: true }).click();
  await owner.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Nhật ký ván" }).click();
  const log = owner.getByRole("dialog", { name: "Nhật ký ván" });
  await expect(log.getByText(/Chạy 2 lần · Lần 1/)).toBeVisible();
  await expect(log.getByText(/Chạy 2 lần · Lần 2/)).toBeVisible();
  await owner.keyboard.press("Escape");
  // The replay draws both boards too.
  const replayPage = await owner.context().newPage();
  await replayPage.goto(`/hands/${hand1.hand_id}`);
  await replayPage.getByRole("button", { name: "Tới kết quả" }).click();
  await expect(replayPage.locator(".board-twice .board-run")).toHaveCount(2);
  await replayPage.close();

  // Whoever lost it all buys back in, so hand #2 deals.
  for (const s of seats) if (s.stack === 0) await api(s.seat === 1 ? owner : guest, "POST", `/api/rooms/${roomId}/rebuy/`);
  await expect.poll(async () => (await api(owner, "GET", `/api/rooms/${roomId}/snapshot/`)).table.hand?.hand_no, { timeout: 20_000 }).toBe(2);

  // Hand #2: the player not to act sits out from the next hand (so no hand #3 comes), then the
  // one to act folds preflop. No board was dealt: the rabbit hunt shows all five cards.
  const folder = await whoActs();
  const winner = other(folder);
  const folderName = folder === owner ? ownerName : guestName;
  await winner.getByRole("button", { name: "Menu", exact: true }).click();
  await winner.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Nghỉ ván sau" }).click();
  await expect.poll(async () => (await api(owner, "GET", `/api/rooms/${roomId}/snapshot/`)).table.seats.some((s: { sitting_out: boolean }) => s.sitting_out)).toBe(true);
  const myCards = await folder.locator(".me-cards [role=img]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  expect(myCards).toHaveLength(2);
  await folder.getByRole("region", { name: "Tới lượt bạn" }).locator(".act-fold").click();
  for (const p of pages) {
    await expect(p.locator("[data-hand=complete]")).toBeVisible();
    await expect(p.locator(".board-rabbit .pc.is-rabbit")).toHaveCount(5);
    await expect(p.locator(".board-rabbit")).toContainText("Bài chưa chia");
    // won by folds: nobody's cards are up yet, both may show theirs
    await expect(p.getByRole("button", { name: "Ngửa bài" })).toBeVisible();
  }
  await expect(winner.locator(".seat-shown")).toHaveCount(0);

  // The folder shows: the other player sees those two cards face up, and the log says so.
  await folder.getByRole("button", { name: "Ngửa bài" }).click();
  await expect(folder.getByRole("button", { name: "Ngửa bài" })).toHaveCount(0);
  const shown = winner.locator(".seat-shown .pc-flip-front");
  await expect(shown).toHaveCount(2);
  expect(await shown.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(myCards);
  await expect(winner.getByRole("button", { name: "Ngửa bài" })).toBeVisible(); // the winner's are still down
  await winner.getByRole("button", { name: "Menu", exact: true }).click();
  await winner.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Nhật ký ván" }).click();
  await expect(winner.getByRole("dialog", { name: "Nhật ký ván" }).getByText(`${folderName} ngửa bài`)).toBeVisible();
  await expect(winner.getByRole("dialog", { name: "Nhật ký ván" }).getByText(/^Bài chưa chia:/)).toBeVisible();
  await winner.keyboard.press("Escape");

  // Kept with the hand: its replay has the rabbit cards and the shown cards.
  const hand2 = (await api(owner, "GET", `/api/rooms/${roomId}/hands/`)).hands[0];
  const replay2 = await api(winner, "GET", `/api/hands/${hand2.hand_id}/replay/`);
  expect(replay2.rabbit_cards).toHaveLength(5);
  expect(replay2.shown_cards).toHaveLength(1);
  await winner.goto(`/hands/${hand2.hand_id}`);
  await winner.getByRole("button", { name: "Tới kết quả" }).click();
  await expect(winner.locator(".board-rabbit .pc.is-rabbit")).toHaveCount(5);
  await expect(winner.locator(".seat-shown .pc-flip-front")).toHaveCount(2);
  await expect(winner.getByText(`${folderName} ngửa bài sau ván.`)).toBeVisible();
});
