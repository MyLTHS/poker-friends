// Members only (server GUESTS_ALLOWED off, docs/api/openapi.yaml AuthConfig): who may not go on,
// and where to send them. The API answers 401 `login_required` to a stranger or an old guest
// session (log in), 403 `not_approved` to an account the owner has not let in (wait: logging in
// again would not help, so it must never lead back to the login, or the two would loop).
// After logging in the player goes back where they were (`?next=`), which keeps an invite link's
// token. Only this site's own paths count: no "//host", no "/\host", no scheme (open redirect).

export type AuthBlock = "login" | "approval";

export function authBlock(code: string): AuthBlock | null {
  if (code === "login_required") return "login";
  if (code === "not_approved") return "approval";
  return null;
}

/** After the table's socket was closed with 4401: ask /api/auth/me/ which it is. */
export function blockFromMe(me: { ok: true; data: { is_guest: boolean; member: boolean } } | { ok: false }): AuthBlock {
  return me.ok && !me.data.is_guest && !me.data.member ? "approval" : "login";
}

const BASE = "https://this.site";

/** `next` when it is a path of this site outside the account pages; null otherwise. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || url.pathname === "/account" || url.pathname.startsWith("/account/")) return null;
  // Check what is returned, not only what came in: dot segments normalise away ("/.//evil.example",
  // "/a/..//evil.example", "/%2e//evil.example" all become "//evil.example", another site).
  const out = url.pathname + url.search + url.hash;
  if (out.startsWith("//") || out.startsWith("/\\")) return null;
  return out;
}

const withNext = (path: string, next: string | null | undefined) => {
  const safe = safeNext(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
};

export const loginPath = (next?: string | null) => withNext("/account", next);
export const signupPath = (next?: string | null) => withNext("/account/signup", next);

/** The page the browser is on, to come back to after logging in. */
export const herePath = () => window.location.pathname + window.location.search + window.location.hash;

// Signing up takes days (email, then the owner's approval): the place to go after the first login
// is kept in localStorage for a week, then dropped.
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "pf:next";
const WEEK = 7 * 24 * 3600 * 1000;
const browserStore = (): Store | null => (typeof window === "undefined" ? null : window.localStorage);

export function rememberNext(next: string | null | undefined, store: Store | null = browserStore(), now = Date.now()) {
  const safe = safeNext(next);
  if (!safe || !store) return;
  try {
    store.setItem(KEY, JSON.stringify({ next: safe, at: now }));
  } catch {
    // private window or storage off: the player just lands on the lobby
  }
}

export function takeRememberedNext(store: Store | null = browserStore(), now = Date.now()): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    store.removeItem(KEY);
    if (!raw) return null;
    const { next, at } = JSON.parse(raw) as { next?: string; at?: number };
    return typeof at === "number" && now - at <= WEEK ? safeNext(next) : null;
  } catch {
    return null;
  }
}

/** Leave a page the API refused: to the login (coming back here afterwards) or to the account
 *  page, which shows "Đợi chủ phòng duyệt". Never from the account pages themselves. */
export function goToAuth(block: AuthBlock) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/account")) return;
  if (block === "login") {
    window.location.assign(loginPath(herePath()));
    return;
  }
  // Waiting can take days: remember this page (an invite link) for when the owner approves.
  rememberNext(herePath());
  // A full load on purpose (as for the login above): nothing of the refused page should survive.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/account");
}
