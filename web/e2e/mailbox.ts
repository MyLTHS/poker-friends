// The emails Django sent during the E2E run. Without EMAIL_URL Django prints each email to its
// stdout (apps/accounts/console_email.py, flushed after each one); playwright.config.ts sends that
// stdout to MAIL_LOG, so a test reads the link a player would click in their mailbox.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@playwright/test";

export const MAIL_LOG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e-mail.log"); // web/, gitignored

/** The newest link to `page` (e.g. "/account/verify") in an email to `to`, waiting until it
 *  arrives. Emails are blocks separated by a line of dashes, "To: <address>" in their header. */
export async function linkFromEmail(to: string, page: string): Promise<URL> {
  let link: URL | undefined;
  await expect
    .poll(
      async () => {
        const log = await readFile(MAIL_LOG, "utf8").catch(() => "");
        const emails = log.split(/^-{79}$/m).filter((email) => email.includes(`To: ${to}\n`));
        const found = emails.at(-1)?.match(/https?:\/\/\S+/g)?.find((url) => new URL(url).pathname === page);
        link = found ? new URL(found) : undefined;
        return found ?? null;
      },
      { message: `an email to ${to} with a link to ${page}` },
    )
    .not.toBeNull();
  return link!;
}
