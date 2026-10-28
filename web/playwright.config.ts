import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

import { MAIL_LOG } from "./e2e/mailbox";

// End-to-end tests (B4b): real Django + Channels and the real web app, several browsers.
// Run with `npm run e2e`. Locally the Chromium Playwright needs must already be installed
// (never run `playwright install` here without asking); CI installs it (.github/workflows/ci.yml).

const HERE = path.dirname(fileURLToPath(import.meta.url)); // web/ (package.json is "type": "module")
const ROOT = path.resolve(HERE, "..");
// Ports: 3100 / 8000 as in CI; E2E_WEB_PORT / E2E_API_PORT run a second copy beside another
// checkout's run. The specs read the web address from E2E_WEB.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8000);
const WEB = `http://localhost:${WEB_PORT}`;
const API = `localhost:${API_PORT}`;
process.env.E2E_WEB = WEB;
// E2E_MEMBERS_ONLY=1 (`npm run e2e:members`): Django with guests off, and only members.spec.ts;
// otherwise every other spec, with guests on. One dev server per folder: they cannot share a run.
const MEMBERS_ONLY = process.env.E2E_MEMBERS_ONLY === "1";
// A throwaway SQLite database, recreated on every run, so tests never touch db.sqlite3.
const E2E_DB = path.join(ROOT, "e2e.sqlite3");
const djangoEnv = {
  DATABASE_URL: `sqlite:///${E2E_DB}`,
  FRONTEND_URL: WEB,
  DJANGO_ALLOWED_HOSTS: "localhost,127.0.0.1",
  DJANGO_DEBUG: "true",
  // Every spec makes its guests from this one address; the real limit (20 an hour) is unit-tested.
  GUESTS_PER_IP_HOUR: "200",
  ...(MEMBERS_ONLY ? { GUESTS_ALLOWED: "false" } : {}),
};

export default defineConfig({
  testDir: "e2e",
  ...(MEMBERS_ONLY ? { testMatch: "members.spec.ts" } : { testIgnore: "members.spec.ts" }),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: WEB, browserName: "chromium", trace: "retain-on-failure" },
  webServer: [
    {
      // stdout holds only the emails (request logs go to stderr): the tests read links from it.
      command: `rm -f "${E2E_DB}" "${MAIL_LOG}" && uv run python manage.py migrate --noinput -v0 && uv run python manage.py runserver 127.0.0.1:${API_PORT} --noreload > "${MAIL_LOG}"`,
      cwd: ROOT,
      env: djangoEnv,
      url: `http://127.0.0.1:${API_PORT}/api/auth/config/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- -p ${WEB_PORT}`,
      cwd: HERE,
      env: { DJANGO_URL: `http://${API}`, NEXT_PUBLIC_DJANGO_WS: `ws://${API}` },
      url: WEB,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
