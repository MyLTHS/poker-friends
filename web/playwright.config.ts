import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// End-to-end tests (B4b): real Django + Channels and the real web app, several browsers.
// Run with `npm run e2e`. Locally the Chromium Playwright needs must already be installed
// (never run `playwright install` here without asking); CI installs it (.github/workflows/ci.yml).

const HERE = path.dirname(fileURLToPath(import.meta.url)); // web/ (package.json is "type": "module")
const ROOT = path.resolve(HERE, "..");
const WEB = "http://localhost:3100";
// A throwaway SQLite database, recreated on every run, so tests never touch db.sqlite3.
const E2E_DB = path.join(ROOT, "e2e.sqlite3");
const djangoEnv = {
  DATABASE_URL: `sqlite:///${E2E_DB}`,
  FRONTEND_URL: WEB,
  DJANGO_ALLOWED_HOSTS: "localhost,127.0.0.1",
  DJANGO_DEBUG: "true",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: WEB, browserName: "chromium", trace: "retain-on-failure" },
  webServer: [
    {
      command: `rm -f "${E2E_DB}" && uv run python manage.py migrate --noinput -v0 && uv run python manage.py runserver 127.0.0.1:8000 --noreload`,
      cwd: ROOT,
      env: djangoEnv,
      url: "http://127.0.0.1:8000/api/auth/config/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- -p 3100",
      cwd: HERE,
      env: { DJANGO_URL: "http://localhost:8000", NEXT_PUBLIC_DJANGO_WS: "ws://localhost:8000" },
      url: WEB,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
