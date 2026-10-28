// Members only (server GUESTS_ALLOWED off, docs/api/openapi.yaml AuthConfig): any real account
// that is logged in may play, nothing to approve or verify. The API answers 401 `login_required`
// to a stranger or an old guest session: off to the login, and back where they were afterwards
// (`?next=`), which keeps an invite link's token. Only this site's own paths count: no "//host",
// no "/\host", no scheme (open redirect).

/** The API refused the player for who they are: log in (or sign up) first. */
export const needsLogin = (code: string) => code === "login_required";

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

// Google's flow leaves the site and comes back without ?next=: the place to go is kept in
// localStorage meanwhile (for a week at most, then dropped).
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

/** Leave a page the API refused for the login, coming back here afterwards. A full load on
 *  purpose: nothing of the refused page should survive. Never from the account pages themselves. */
export function goToLogin() {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/account")) return;
  window.location.assign(loginPath(herePath()));
}
