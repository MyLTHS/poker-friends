// The table's per-browser choices (sound, keyboard shortcuts) in localStorage. Every access is
// guarded: private windows and blocked storage throw, and then the choice lasts for this page only.

export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored JSON under `key`, or null when missing, unreadable or blocked. */
export function readJson(key: string, store: Storage | null = browserStorage()): unknown {
  try {
    const raw = store?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, store: Storage | null = browserStorage()): void {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked
  }
}
