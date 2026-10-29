// C4 + C5: the D1 account screens on the real server, desktop and landscape phone. The flows go
// through the links in the emails like a player would: Django prints each email, mailbox.ts reads
// the link. Phone sizes, overflow, 44px targets and the accessibility checks are in checks.ts.

import { expect, test, type Page, type Route } from "@playwright/test";

import { PHONES, a11yProblems, layoutProblems, smallTargets } from "./checks";
import { linkFromEmail } from "./mailbox";

const WEB = process.env.E2E_WEB ?? "http://localhost:3100";
const PASSWORD = "ban-ni-xanh-2026";
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** The Django API from the page's own cookies (session, csrftoken), like the web app calls it. */
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

/** The login's first box: a name makes a guest (Poker Now style). Names are unique per run. */
async function playAsGuest(page: Page) {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Bạn tên gì?" }).first()).toBeVisible();
  await page.getByLabel("Tên ở bàn").fill(`Khach${unique()}`);
  await page.getByRole("button", { name: "Vào chơi" }).click();
  await expect(page.getByText("Thẻ khách")).toBeVisible();
}

/** On the login form already: fill it in and press "Đăng nhập". */
async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test.describe("account flows (the email links where there still are some)", () => {
  test("a guest with chips upgrades and keeps them, then logs in again with the new account", async ({ page }) => {
    await playAsGuest(page);
    // The guest opens a table, sits and is granted chips: the upgrade must carry them over.
    const guest = await api(page, "GET", "/api/auth/me/");
    const created = await api(page, "POST", "/api/rooms/", { name: "Bàn của khách", small_blind: 1, big_blind: 2 });
    const roomId = created.room.room_id;
    await api(page, "POST", `/api/rooms/${roomId}/seats/`, { seat: 1 });
    await api(page, "POST", `/api/rooms/${roomId}/chips/`, { player_id: String(guest.id), amount: 750 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Trở thành thành viên" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Chip của bạn ở các phòng" })).toContainText(/Bàn của khách\s*750/);

    const email = `e2e-${unique()}@example.com`;
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Nâng cấp & giữ chip" }).click();

    await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByText(/Đã nâng cấp\. Từ giờ đăng nhập bằng/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Bàn của khách/ })).toContainText("Còn 750 chip");

    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("heading", { name: "Bạn tên gì?" }).first()).toBeVisible();

    // No email to verify first: the new account logs straight in, chips still there.
    await logIn(page, email, PASSWORD);
    await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Bàn của khách/ })).toContainText("Còn 750 chip");
  });

  test("signing up logs in at once; the same email again is refused under its box", async ({ browser, page }) => {
    const id = unique();
    const email = `signup-${id}@example.com`;
    await page.goto("/account/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Tên ở bàn").fill(`Ban${id}`);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
    await expect(page.getByText("Độ mạnh:", { exact: false })).toBeAttached();
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();

    // in at once: the lobby, as the new account
    await expect(page).toHaveURL(/\/rooms$/);
    await expect(page.getByRole("heading", { name: "Chọn một bàn" })).toBeVisible();
    expect((await api(page, "GET", "/api/auth/me/")).email).toBe(email);

    // Verifying the email is optional now, and the link in the email still works.
    await page.goto((await linkFromEmail(email, "/account/verify")).href);
    await expect(page.getByRole("heading", { name: "Email đã xác minh" })).toBeVisible();
    await expect(page).toHaveURL(/\/account\/verify$/); // the token left the address bar
    await page.goto("/account");
    await expect(page.getByText("Đã xác minh")).toBeVisible();

    // Someone else with the same email: the answer sits under the email box, which takes the focus.
    const other = await (await browser.newContext()).newPage();
    await other.goto("/account/signup");
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Tên ở bàn").fill(`Khac${id}`);
    await other.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
    await other.getByRole("button", { name: "Tạo tài khoản" }).click();
    const box = other.getByLabel("Email");
    await expect(box).toHaveAttribute("aria-invalid", "true");
    await expect(box).toHaveAccessibleDescription(/Email này đã thuộc một tài khoản khác/);
    await expect(box).toBeFocused();
  });

  test("forgot password: the link sets a new one, the old one stops working", async ({ page }) => {
    const id = unique();
    const email = `quen-${id}@example.com`;
    const fresh = "go-mat-khau-moi-77";
    await page.goto("/account/forgot");
    // An account with a password; the reset link proves the address, so it needs no verifying.
    await csrfSettled(page);
    await api(page, "POST", "/api/auth/signup/", { email, username: `Quen${id}`, password: PASSWORD });

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Gửi link đặt lại" }).click();
    await expect(page.getByText(`Đã gửi tới q•••@example.com`)).toBeVisible();

    await page.goto((await linkFromEmail(email, "/account/reset")).href);
    await expect(page).toHaveURL(/\/account\/reset$/); // the token left the address bar
    await hydrated(page);
    // Two different passwords: "Lưu" says why under "Nhập lại" and sends nothing.
    const resets: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/password/reset/")) resets.push(request.method());
    });
    await page.getByLabel("Mật khẩu mới").fill(fresh);
    await page.getByLabel("Nhập lại").fill("khac-han-roi-99");
    await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
    const again = page.getByLabel("Nhập lại");
    await expect(again).toBeFocused();
    await expect(again).toHaveAccessibleDescription("Hai mật khẩu chưa khớp");
    expect(resets).toEqual([]);

    await again.fill(fresh);
    await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
    await expect(page.getByText("Đã đổi mật khẩu")).toBeVisible();

    await page.getByRole("link", { name: "Đăng nhập" }).click();
    await logIn(page, email, PASSWORD);
    await expect(page.getByRole("alert").filter({ hasText: "Sai email hoặc mật khẩu." })).toBeVisible();
    await logIn(page, email, fresh);
    await expect(page.getByRole("heading", { name: "Hồ sơ" })).toBeVisible();
    await expect(page.getByText("Đã xác minh")).toBeVisible();
  });
});

test("a guest who logs out is asked first, and staying keeps the guest", async ({ page }) => {
  await playAsGuest(page);
  await page.getByRole("button", { name: "Rời tài khoản khách" }).click();
  await expect(page.getByRole("dialog", { name: "Rời tài khoản khách?" })).toBeVisible();
  await page.getByRole("button", { name: "Ở lại" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Thẻ khách")).toBeVisible();
});

test("a wrong password shows the error on the form and moves the focus to it", async ({ page }) => {
  await page.goto("/account");
  await logIn(page, `nobody-${unique()}@example.com`, "wrong-password-1");
  await expect(page.getByRole("alert").filter({ hasText: "Sai email hoặc mật khẩu." })).toBeVisible();
  await expect(page.locator(":focus")).toContainText("Sai email hoặc mật khẩu.");
  await expect(page.getByRole("heading", { name: "Bạn tên gì?" }).first()).toBeVisible();
});

test("only the last action's error shows: a refused name after a wrong password, and back", async ({ page }) => {
  await page.route("**/api/auth/guest/", (route) =>
    route.fulfill({ status: 429, headers: { "Retry-After": "120" }, json: { code: "rate_limited", message: "Too many." } }),
  );
  await page.goto("/account");
  await logIn(page, `nobody-${unique()}@example.com`, "wrong-password-1");
  await expect(page.getByRole("alert").filter({ hasText: "Sai email hoặc mật khẩu." })).toBeVisible();

  await page.getByLabel("Tên ở bàn").fill(`Khach${unique()}`);
  await page.getByRole("button", { name: "Vào chơi" }).click();
  await expect(page.locator(":focus")).toContainText("Bạn thử quá nhiều lần. Đợi khoảng 2 phút");
  await expect(page.getByText("Sai email hoặc mật khẩu.")).toHaveCount(0);

  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("Sai email hoặc mật khẩu.")).toBeVisible();
  await expect(page.getByText("Bạn thử quá nhiều lần", { exact: false })).toHaveCount(0);
});

test("a name already used is said under the name box", async ({ browser, page }) => {
  const taken = `Trung${unique()}`;
  const other = await (await browser.newContext()).newPage();
  await other.goto("/account");
  await other.getByLabel("Tên ở bàn").fill(taken);
  await other.getByRole("button", { name: "Vào chơi" }).click();
  await expect(other.getByText("Thẻ khách")).toBeVisible();

  await page.goto("/account");
  const name = page.getByLabel("Tên ở bàn");
  await name.fill(taken.toLowerCase());
  await page.getByRole("button", { name: "Vào chơi" }).click();
  await expect(name).toHaveAccessibleDescription("Tên này đã có người dùng, chọn tên khác.");
  await expect(name).toBeFocused();
  await other.context().close();
});

test("the signup and forgot forms wait for the CSRF cookie before sending", async ({ page }) => {
  for (const [path, button] of [["/account/signup", "Tạo tài khoản"], ["/account/forgot", "Gửi link đặt lại"]]) {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const slowConfig = async (route: Route) => {
      await held;
      await route.continue();
    };
    await page.route("**/api/auth/config/", slowConfig);
    await page.goto(path);
    const send = page.getByRole("button", { name: button });
    await expect(send).toBeDisabled();
    await expect(send).toHaveAttribute("aria-busy", "true");
    release();
    await expect(send).toBeEnabled();
    await page.unroute("**/api/auth/config/", slowConfig);
  }
});

test("a guest who opens the signup is sent to the upgrade, which keeps the chips", async ({ page }) => {
  await playAsGuest(page);
  await page.goto("/account/signup");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Trở thành thành viên" })).toBeVisible();
});

test("the strength bar never praises a password the server will refuse", async ({ page }) => {
  await page.goto("/account/signup");
  await page.getByLabel("Email").fill("lym.nguyen@gmail.com");
  await page.getByLabel("Tên ở bàn").fill("Lym");
  const password = page.getByLabel("Mật khẩu", { exact: true });
  const rule = page.getByRole("listitem").filter({ hasText: "Không phổ biến, không giống tên hay email" });

  await password.fill("Password1234");
  await expect(page.getByText("Yếu: quá phổ biến, dễ đoán")).toBeVisible();
  await expect(rule).toContainText("(chưa đạt)");
  await password.fill("Nguyen2026!");
  await expect(page.getByText("Yếu: giống tên hoặc email")).toBeVisible();
  await password.fill("ban-ni-xanh-2026");
  await expect(page.getByText("Rất mạnh")).toBeVisible();
  await expect(rule).toContainText("(đạt)");
});

test("forgot password confirms without saying whether the email has an account", async ({ page }) => {
  await page.goto("/account/forgot");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Gửi link đặt lại" }).click();
  await expect(page.getByText("Đã gửi tới s•••@example.com")).toBeVisible();
  await expect(page.getByText("Nếu email này có tài khoản", { exact: false })).toBeVisible();
});

test("a broken reset link and a broken verify link say so", async ({ page }) => {
  await page.goto("/account/reset?uid=1&token=not-a-token");
  await page.getByLabel("Mật khẩu mới").fill(PASSWORD);
  await page.getByLabel("Nhập lại").fill(PASSWORD);
  await expect(page.getByText("Hai mật khẩu khớp nhau")).toBeVisible();
  await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Link không dùng được nữa" })).toBeVisible();

  await page.goto("/account/verify?token=not-a-token");
  await expect(page.getByRole("heading", { name: "Link không dùng được" })).toBeVisible();
});

// ---------- accessibility ----------

/** The pages a visitor who is not logged in can open, and the heading that says it is ready. */
const PAGES = [
  { path: "/account", ready: "Tên ở bàn" },
  { path: "/account/signup", ready: "Tạo tài khoản" },
  { path: "/account/forgot", ready: "Quên mật khẩu?" },
  { path: "/account/reset?uid=1&token=not-a-token", ready: "Đặt mật khẩu mới" },
  { path: "/account/verify?token=not-a-token", ready: "Link không dùng được" },
];

/** React has taken the page over: the server's HTML shows earlier, before any handler runs. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector("main") ?? {}).some((key) => key.startsWith("__reactFiber")));
}

/**
 * Wait until the page's own GET /api/auth/config/ calls have all answered before reading the
 * csrftoken cookie. Each call made without a cookie gets a new token, and the dev server makes two
 * at once (React StrictMode runs the effect twice): read between them, or add a GET of our own,
 * and the header no longer matches the cookie the next POST sends (403 "CSRF token incorrect").
 */
async function csrfSettled(page: Page) {
  await hydrated(page);
  await page.waitForLoadState("networkidle");
}

async function open(page: Page, path: string, ready: string) {
  await page.goto(path);
  await expect(page.getByText(ready, { exact: true }).locator("visible=true").first()).toBeVisible();
  await hydrated(page);
}

test.describe("accessibility", () => {
  test("every page: labels, names, the ids aria-* points at, one h1", async ({ page }) => {
    for (const { path, ready } of PAGES) {
      await open(page, path, ready);
      expect(await a11yProblems(page), path).toEqual([]);
    }
  });

  test("autocomplete tells the password manager which password is which", async ({ page }) => {
    const expected: [string, [string, string][]][] = [
      ["/account", [["Tên ở bàn", "nickname"], ["Email", "email"], ["Mật khẩu", "current-password"]]],
      ["/account/signup", [["Email", "email"], ["Tên ở bàn", "nickname"], ["Mật khẩu", "new-password"]]],
      ["/account/forgot", [["Email", "email"]]],
      ["/account/reset?uid=1&token=x", [["Mật khẩu mới", "new-password"], ["Nhập lại", "new-password"]]],
    ];
    for (const [path, fields] of expected) {
      await page.goto(path);
      for (const [label, value] of fields) {
        await expect(page.getByLabel(label, { exact: true }).locator("visible=true").first(), `${path} ${label}`).toHaveAttribute("autocomplete", value);
      }
    }
    await playAsGuest(page);
    await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  });

  test("an empty form: each error sits under its box, said by it, and the first takes the focus", async ({ page }) => {
    await page.goto("/account/signup");
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
    const email = page.getByLabel("Email");
    await expect(email).toBeFocused();
    for (const label of ["Email", "Tên ở bàn"]) {
      const box = page.getByLabel(label, { exact: true });
      await expect(box).toHaveAttribute("aria-invalid", "true");
      await expect(box).toHaveAccessibleDescription("Chưa điền ô này.");
    }
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute("aria-invalid", "true");
    // the focus reads the first error; the others wait for their box (not three alerts at once)
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    expect(await a11yProblems(page)).toEqual([]);

    // Typing in a box with an error keeps every keystroke (the passwords are controlled boxes).
    const password = page.getByLabel("Mật khẩu", { exact: true });
    await password.fill("ban-ni-xanh-2026");
    await expect(password).toHaveValue("ban-ni-xanh-2026");
    await expect(password).not.toHaveAttribute("aria-invalid");

    // A wrong email: its own message; typing clears the error of that box only.
    await email.fill("lym-o-dau");
    await expect(email).not.toHaveAttribute("aria-invalid");
    await expect(page.getByLabel("Tên ở bàn")).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(email).toHaveAccessibleDescription(/Email chưa đúng/);
    await expect(email).toBeFocused();
  });

  test("Tab goes through the login form in reading order", async ({ page }) => {
    await page.goto("/account");
    await hydrated(page);
    await page.getByLabel("Tên ở bàn").focus();
    const google = (await page.getByRole("button", { name: "Tiếp tục với Google" }).count()) > 0;
    const order = [
      page.getByRole("button", { name: "Vào chơi" }),
      page.getByLabel("Email"),
      page.getByLabel("Mật khẩu", { exact: true }),
      page.getByRole("button", { name: "Hiện mật khẩu" }),
      page.getByRole("link", { name: "Quên mật khẩu?" }),
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
      ...(google ? [page.getByRole("button", { name: "Tiếp tục với Google" })] : []),
      page.getByRole("link", { name: "Đăng ký" }),
    ];
    for (const next of order) {
      await page.keyboard.press("Tab");
      await expect(next).toBeFocused();
    }
  });
});

// ---------- landscape phone ----------

test.describe("landscape phone", () => {
  test.use({ viewport: PHONES[0], hasTouch: true, isMobile: true });

  test("the login keeps its small hero; other pages get the bar", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator(".m-hero")).toBeVisible();
    await expect(page.locator(".auth-hero")).toBeHidden();
    // the name comes first: its button is on the first screen, the email login under it
    await expect(page.getByRole("button", { name: "Vào chơi" })).toBeInViewport();

    await page.goto("/account/signup");
    await expect(page.locator(".appbar").getByText("Tạo tài khoản")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tạo tài khoản" })).toBeVisible();
  });

  /** Overflow, finger-size targets and the accessibility audit of the page as it is now. */
  async function measure(page: Page, where: string) {
    const problems = [...(await layoutProblems(page)), ...(await smallTargets(page)), ...(await a11yProblems(page))];
    return problems.map((p) => `${where}: ${p}`);
  }

  test("every page fits 844×390, 932×430 and 667×375, with 44px targets", async ({ page }) => {
    const problems: string[] = [];
    for (const size of PHONES) {
      await page.setViewportSize(size);
      for (const { path, ready } of PAGES) {
        await open(page, path, ready);
        problems.push(...(await measure(page, `${size.width}×${size.height} ${path}`)));
      }
      // the longest the forms get: every box with its error under it
      await open(page, "/account/signup", "Tạo tài khoản");
      await page.getByRole("button", { name: "Tạo tài khoản" }).click();
      await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
      problems.push(...(await measure(page, `${size.width}×${size.height} signup with errors`)));
    }
    expect(problems).toEqual([]);
  });

  test("the guest upgrade and the profile fit all three phones", async ({ page }) => {
    await page.goto("/account");
    await csrfSettled(page);
    await api(page, "POST", "/api/auth/guest/", {});
    const problems: string[] = [];
    for (const size of PHONES) {
      await page.setViewportSize(size);
      await open(page, "/account", "Thẻ khách");
      problems.push(...(await measure(page, `${size.width}×${size.height} upgrade`)));
    }
    await api(page, "POST", "/api/auth/upgrade/", { email: `dt-${unique()}@example.com`, password: PASSWORD });
    for (const size of PHONES) {
      await page.setViewportSize(size);
      await open(page, "/account", "Phòng đang có chip");
      problems.push(...(await measure(page, `${size.width}×${size.height} profile`)));
    }
    expect(problems).toEqual([]);
  });

  test("the overflow check sees a box wider than the screen", async ({ page }) => {
    await page.goto("/account/forgot");
    await hydrated(page); // hydration would drop a node React did not render
    await page.evaluate(() => {
      const wide = document.createElement("p");
      wide.textContent = "rộng quá";
      wide.style.minWidth = "2000px"; // a flex item would shrink below its width
      document.querySelector("main")!.append(wide);
    });
    expect((await layoutProblems(page)).join("\n")).toMatch(/scrolls sideways[\s\S]*"rộng quá" sticks out/);
  });

  test("the keyboard does not cover the box being typed in", async ({ page }) => {
    // Android with interactive-widget=resizes-content (app/account/layout.tsx) shrinks the page to
    // what the keyboard leaves; here the window shrinks the same way, to about 45% of its height.
    await page.goto("/account");
    await expect(page.locator("meta[name=viewport]")).toHaveAttribute("content", /interactive-widget=resizes-content/);
    for (const size of PHONES) {
      for (const { path, label } of [
        { path: "/account", label: "Mật khẩu" },
        { path: "/account/signup", label: "Mật khẩu" },
        { path: "/account/forgot", label: "Email" },
      ]) {
        await page.setViewportSize(size);
        await page.goto(path);
        await hydrated(page);
        const box = page.getByLabel(label, { exact: true }).locator("visible=true").first();
        await box.focus();
        await page.setViewportSize({ width: size.width, height: Math.round(size.height * 0.45) });
        await expect(box, `${size.width}×${size.height} ${path}`).toBeInViewport({ ratio: 1 });
        const covered = await box.evaluate((el) => {
          const bar = document.querySelector(".appbar");
          if (!bar || !bar.checkVisibility()) return false;
          return el.getBoundingClientRect().top < bar.getBoundingClientRect().bottom;
        });
        expect(covered, `${size.width}×${size.height} ${path}: under the top bar`).toBe(false);
      }
    }
  });
});

test("reduced motion: the form card fades in instead of rising", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/account");
  const card = page.locator(".auth-card").first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe("auth-fade");
});
