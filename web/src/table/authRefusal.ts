"use client";

// The table's socket was closed with 4401 (members only, docs/api/ws-protocol.md): no retry. Who
// is the player now? A stranger or an old guest logs in and comes back to this table; an account
// the owner has not approved (or no longer does) waits, never back to the login.
import { useEffect, useState } from "react";

import { createAuthApi } from "@/account/api";
import { blockFromMe, herePath, loginPath, type AuthBlock } from "@/account/members";

export type AuthRefusal = { block: AuthBlock; loginHref: string };

/** `refused`: the socket was closed with 4401. "checking" while /api/auth/me/ answers. */
export function useAuthRefusal(refused: boolean): AuthRefusal | "checking" | undefined {
  const [answer, setAnswer] = useState<AuthRefusal | undefined>(undefined);
  useEffect(() => {
    if (!refused) return;
    let cancelled = false;
    void createAuthApi()
      .me()
      .then((me) => {
        if (!cancelled) setAnswer({ block: blockFromMe(me), loginHref: loginPath(herePath()) });
      });
    return () => {
      cancelled = true;
    };
  }, [refused]);
  if (!refused) return undefined;
  return answer ?? "checking";
}
