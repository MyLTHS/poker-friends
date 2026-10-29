// F (web): "Gửi phản hồi" on the real server — from a room page's bar, from the table's settings,
// not logged in, rate-limited, on a landscape phone. What was sent is read back from the E2E
// database (the staff read it in the Django admin). The browser error reporter sends nothing
// under Playwright (navigator.webdriver): its unit tests are src/feedback/reporter.test.ts.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { api, newGuest, outOfView, phone, smallTargets } from "./helpers";

const RUN = Date.now().toString(36).slice(-4);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type Stored = { kind: string; page: string; room_id: number | null; user__username: string | null } | null;

/** The feedback row with this message, from the E2E database (playwright.config.ts E2E_DB). */
function stored(message: string): Stored {
  const code = [
    "import json",
    "from apps.feedback.models import Feedback",
    `row = Feedback.objects.filter(message=${JSON.stringify(message)}).values("kind", "page", "room_id", "user__username").first()`,
    "print(json.dumps(row))",
  ].join("; ");
  const out = execFileSync("uv", ["run", "python", "manage.py", "shell", "-c", code], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `sqlite:///${path.join(ROOT, "e2e.sqlite3")}`, DJANGO_DEBUG: "true" },
  });
  return JSON.parse(out.toString().trim().split("\n").at(-1) ?? "null");
}

const dialogOf = (page: Page) => page.getByRole("dialog", { name: "Gửi phản hồi" });

async function write(page: Page, kind: string, message: string) {
  const dialog = dialogOf(page);
  await dialog.getByText(kind, { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: kind })).toBeChecked();
  await dialog.getByLabel("Nội dung").fill(message);
  await dialog.getByRole("button", { name: "Gửi", exact: true }).click();
}

async function noSeriousAxe(page: Page) {
  const result = await new AxeBuilder({ page }).include("dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => ({ rule: v.id, nodes: v.nodes.map((n) => n.target.join(" ")) }))).toEqual([]);
}

// One guest for a room page (its history), the table and the phone: the suite shares the server's limit of
// 20 new guests an hour from one address (apps/accounts/ratelimit.py).
test("a guest sends feedback from a room page and from the table, desktop and phone", async ({ browser }) => {
  test.setTimeout(180_000);
  const lan = await newGuest(browser, `Gop${RUN}`, { viewport: { width: 1440, height: 900 } });
  const page = lan.page;
  const detail = await api(page, "POST", "/api/rooms/", { name: "Bàn góp ý", small_blind: 1, big_blind: 2 });
  const id = detail.room.room_id;
  // the room's own page is its table now (no app bar): its history page has the bar's button
  await page.goto(`/rooms/${id}/history`);

  const open = page.getByRole("button", { name: "Gửi phản hồi" });
  await open.click();
  const dialog = dialogOf(page);
  const box = dialog.getByLabel("Nội dung");
  await expect(dialog).toBeVisible();
  await expect(box).toBeFocused();
  await noSeriousAxe(page);

  // Esc closes it and gives the focus back to the button
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();

  // Nothing written: the box says so and keeps the focus
  await open.click();
  await dialog.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(box).toHaveAccessibleDescription(/Viết vài chữ rồi hãy gửi/);
  await expect(box).toBeFocused();

  const idea = `Thêm nút xem lại ván vừa chơi ${RUN}`;
  await box.fill(idea);
  await expect(dialog.getByText(`${idea.length}/2000`)).toBeVisible();
  await box.fill("");
  await write(page, "Ý tưởng", idea);
  await expect(page.getByText("Cảm ơn bạn!")).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(stored(idea)).toEqual({ kind: "idea", page: `/rooms/${id}/history`, room_id: id, user__username: `Gop${RUN}` });

  // The table has no app bar: its settings open the dialog, and the table's room goes with it.
  await page.goto(`/rooms/${id}/table`);
  await page.getByRole("button", { name: "Cài đặt bàn" }).click();
  await page.getByRole("dialog", { name: "Cài đặt bàn" }).getByRole("button", { name: "Gửi phản hồi" }).click();
  await expect(page.getByRole("dialog", { name: "Cài đặt bàn" })).toBeHidden();
  await expect(dialog.getByLabel("Nội dung")).toBeFocused();
  const bug = `Bấm Theo hai lần mới ăn ${RUN}`;
  await write(page, "Lỗi", bug);
  await expect(page.getByText("Cảm ơn bạn!")).toBeVisible();
  expect(stored(bug)).toMatchObject({ kind: "bug", page: `/rooms/${id}/table`, room_id: id });

  // The same guest on a landscape phone (844×390): the rail's button and the dialog fit and are
  // finger-sized; the table keeps it in its menu, nothing over the felt or the bet bar.
  const mobile = await browser.newContext({ ...phone({ width: 844, height: 390 }), storageState: await lan.context.storageState() });
  const m = await mobile.newPage();
  await m.goto("/rooms");
  await m.getByRole("button", { name: "Gửi phản hồi" }).click();
  const mDialog = dialogOf(m);
  await expect(mDialog.getByLabel("Nội dung")).toBeFocused();
  await expect(mDialog.getByRole("button", { name: "Gửi", exact: true })).toBeInViewport();
  expect(await outOfView(m, "dialog[open] *", true)).toEqual([]);
  expect(await smallTargets(m)).toEqual([]);
  await m.keyboard.press("Escape");

  await m.goto(`/rooms/${id}/table`);
  await expect(m.getByRole("button", { name: "Thêm tuỳ chọn" })).toBeVisible();
  await expect(m.getByRole("button", { name: "Gửi phản hồi" })).toHaveCount(0);
  await m.getByRole("button", { name: "Thêm tuỳ chọn" }).click();
  await m.getByRole("dialog", { name: "Cài đặt bàn" }).getByRole("button", { name: "Gửi phản hồi" }).click();
  await expect(mDialog.getByLabel("Nội dung")).toBeFocused();
  await expect(mDialog.getByRole("button", { name: "Gửi", exact: true })).toBeInViewport();
  await mobile.close();
});

test("not logged in: play as a guest and send in one go", async ({ page }) => {
  await page.goto("/rooms");
  await page.getByRole("button", { name: "Gửi phản hồi" }).click();
  const message = `Chưa có tài khoản mà muốn góp ý ${RUN}`;
  await write(page, "Khác", message);

  const dialog = dialogOf(page);
  await expect(dialog.getByText("Cần đăng nhập để gửi (khách cũng được)")).toBeVisible();
  await expect(page.locator(":focus")).toContainText("Cần đăng nhập để gửi");
  // the login comes back to this page afterwards (account/members.ts)
  await expect(dialog.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/account?next=%2Frooms");
  await dialog.getByRole("button", { name: "Chơi bằng khách rồi gửi" }).click();
  await expect(page.getByText("Cảm ơn bạn!")).toBeVisible();

  const row = stored(message);
  expect(row).toMatchObject({ kind: "other", page: "/rooms", room_id: null });
  expect(row?.user__username).toBeTruthy(); // the new guest
});

test("too many: says how long to wait, keeps what was written", async ({ page }) => {
  await page.route("**/api/feedback/", (route) =>
    route.fulfill({ status: 429, headers: { "Retry-After": "600" }, json: { code: "rate_limited", message: "Too many." } }),
  );
  await page.goto("/rooms");
  await page.getByRole("button", { name: "Gửi phản hồi" }).click();
  await write(page, "Lỗi", "Lần thứ mười một");
  await expect(dialogOf(page).getByText("Đợi khoảng 10 phút rồi gửi tiếp")).toBeVisible();
  await expect(dialogOf(page).getByLabel("Nội dung")).toHaveValue("Lần thứ mười một");
});
