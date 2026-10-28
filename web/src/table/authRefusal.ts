"use client";

// The table's socket was closed with 4401 (members only, docs/api/ws-protocol.md): a stranger or
// an old guest session. No retry: log in (or sign up), then come back to this very table.
import { useMemo } from "react";

import { herePath, loginPath } from "@/account/members";

export type AuthRefusal = { loginHref: string };

/** `refused`: the socket was closed with 4401. Only true in the browser (after a close), so the
 *  address can be read while rendering. */
export function useAuthRefusal(refused: boolean): AuthRefusal | undefined {
  return useMemo(() => (refused ? { loginHref: loginPath(herePath()) } : undefined), [refused]);
}
