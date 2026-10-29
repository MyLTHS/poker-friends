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
