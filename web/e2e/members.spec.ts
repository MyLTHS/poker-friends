// Members only (server GUESTS_ALLOWED off, account/members.ts): run on its own with
// `npm run e2e:members` (E2E_MEMBERS_ONLY=1 starts Django with guests off; the other specs need
// them on, and Next allows one dev server per folder, so the two cannot share a run).
// Accounts are made and approved the way the owner does it: manage.py verify_email.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { WEB, api } from "./helpers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN = Date.now().toString(36).slice(-4);
const PASSWORD = "ban-ni-xanh-2026";

/** manage.py on the E2E database (playwright.config.ts E2E_DB), as the owner would run it. */
function manage(...args: string[]): string {
  return execFileSync("uv", ["run", "python", "manage.py", ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `sqlite:///${path.join(ROOT, "e2e.sqlite3")}`, DJANGO_DEBUG: "true" },
  }).toString();
}

/** A real account; `approved`: the owner let it in (verify_email, which also verifies the email). */
function account(name: string, approved: boolean) {
  const email = `${name.toLowerCase()}-${RUN}@example.com`;
  manage(
    "shell",
    "-c",
    `from apps.games.models import User; User.objects.create_user(username=${JSON.stringify(`${name}${RUN}`)}, email=${JSON.stringify(email)}, password=${JSON.stringify(PASSWORD)})`,
  );
  if (approved) manage("verify_email", "--", email);
  return email;
}

const setApproved = (email: string, approved: boolean) =>
  manage("shell", "-c", `from apps.games.models import User; User.objects.filter(email=${JSON.stringify(email)}).update(approved=${approved ? "True" : "False"})`);

/** A browser logged in through the API (the login form is tested below). */
async function loggedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await api(page, "GET", "/api/auth/config/");
  await api(page, "POST", "/api/auth/login/", { email, password: PASSWORD });
  return page;
}

async function logIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("a stranger goes to the login, which offers no guest; an invite link survives it", async ({ browser, page }) => {
  const owner = await loggedIn(browser, account("Chu", true));
  const room = await api(owner, "POST", "/api/rooms/", { name: "Bàn thành viên", small_blind: 1, big_blind: 2, is_private: true });
  const friend = account("Ban", true);

  await page.goto("/rooms");
  await expect(page).toHaveURL(/\/account\?next=%2Frooms$/);
  await expect(page.getByText("Chỉ thành viên. Đăng ký rồi nhờ chủ phòng duyệt.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Chơi ngay bằng khách" })).toHaveCount(0);
  // and the server makes none, even asked directly (with the CSRF token, so the answer is about guests)
  const csrf = (await page.context().cookies(WEB)).find((c) => c.name === "csrftoken")?.value ?? "";
  const guest = await page.request.post(`${WEB}/api/auth/guest/`, {
    data: {},
    headers: { "X-CSRFToken": csrf, Referer: `${WEB}/`, Origin: WEB },
    failOnStatusCode: false,
  });
  expect(await guest.json()).toMatchObject({ code: "guests_disabled" });

  // The invite link: log in, then straight into the room (the token went through the login).
  await page.goto(`/rooms/join?token=${room.invite_token}`);
  await expect(page).toHaveURL(/\/account\?next=%2Frooms%2Fjoin%3Ftoken%3D/);
  await logIn(page, friend);
  await expect(page).toHaveURL(new RegExp(`/rooms/${room.room.room_id}(\\?|$)`));
  await expect(page.getByText("Bàn thành viên").first()).toBeVisible();
});

test("an unsafe next is ignored: the login stays on this site", async ({ page }) => {
  const friend = account("An", true);
  await page.goto(`/account?next=${encodeURIComponent("/.//evil.example/x")}`); // normalises to "//evil.example/x"
  await logIn(page, friend);
  await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(WEB);
});

test("signing up: request sent, the login waits for the owner, approval lets them in", async ({ page }) => {
  const email = `moi-${RUN}@example.com`;
  await page.goto("/account/signup?next=%2Frooms");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Tên ở bàn").fill(`Moi${RUN}`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("heading", { name: "Đã gửi yêu cầu" })).toBeVisible();

  await page.getByRole("link", { name: "Thử đăng nhập" }).click();
  await expect(page).toHaveURL(/\/account\?next=%2Frooms$/);
  await logIn(page, email);
  const wait = page.getByRole("heading", { name: "Đợi chủ phòng duyệt" });
  await expect(wait).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByText("Chủ phòng chưa duyệt. Thử lại sau ít phút nhé.")).toBeVisible();

  manage("verify_email", "--", email); // the owner lets them in
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page).toHaveURL(/\/rooms$/); // back where the signup started
});

test("approval taken back: the API sends to the waiting screen, the table closes 4401 and says so", async ({ browser }) => {
  const email = account("Chi", true);
  const page = await loggedIn(browser, email);
  const room = await api(page, "POST", "/api/rooms/", { name: "Bàn bỏ duyệt", small_blind: 1, big_blind: 2 });
  await page.goto(`/rooms/${room.room.room_id}/table`);
  await expect(page.getByRole("button", { name: /^Gửi 👍/ })).toBeEnabled();

  setApproved(email, false);
  // The socket checks each message: the next one is refused with 4401, and the table says why.
  await page.getByRole("button", { name: /^Gửi 👍/ }).click();
  const card = page.getByRole("alertdialog", { name: "Đợi chủ phòng duyệt" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Xem tài khoản" })).toHaveAttribute("href", "/account");

  // Any room page now: 403 not_approved → the account page waits; never back to the login.
  await page.goto("/rooms");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Đợi chủ phòng duyệt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();

  setApproved(email, true);
  await page.getByRole("button", { name: "Thử lại" }).click();
  // Approved again: back to the page that was refused (remembered), not the profile.
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(page.getByRole("heading", { name: "Chọn một bàn" })).toBeVisible();
  // ...and only once: the account page now stays the account page.
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
});

test("an old guest session is told to upgrade", async ({ browser }) => {
  // Made through the shell: the server makes no guest any more.
  const page = await (await browser.newContext()).newPage();
  await page.goto("/account");
  const sessionKey = manage(
    "shell",
    "-c",
    [
      "from django.contrib.sessions.backends.db import SessionStore",
      "from apps.games.models import User",
      `u = User.objects.create_user(username=${JSON.stringify(`khach-${RUN}`)}, is_guest=True)`,
      "s = SessionStore(); s['_auth_user_id'] = str(u.pk); s['_auth_user_backend'] = 'django.contrib.auth.backends.ModelBackend'; s['_auth_user_hash'] = u.get_session_auth_hash(); s.create()",
      "print(s.session_key)",
    ].join("; "),
  )
    .trim()
    .split("\n")
    .at(-1)!;
  await page.context().addCookies([{ name: "sessionid", value: sessionKey, url: WEB }]);

  await page.goto("/rooms");
  await expect(page).toHaveURL(/\/account\?next=%2Frooms$/);
  await expect(page.getByText("Giờ bàn chỉ dành cho thành viên", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trở thành thành viên" })).toBeVisible();
});
