"use client";

import { useEffect, useState } from "react";

import type { AuthApi, AuthConfig, Me } from "./api";
import { errorText } from "./messages";

export type Boot = { loaded: boolean; config: AuthConfig | null; me: Me | null; error: string | null };

/** Config first (it sets the csrftoken cookie every POST needs), then who is logged in. */
export function useAuthBoot(api: AuthApi): [Boot, (me: Me | null) => void] {
  const [boot, setBoot] = useState<Boot>({ loaded: false, config: null, me: null, error: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await api.config();
      const me = await api.me();
      if (cancelled) return;
      setBoot({
        loaded: true,
        config: config.ok ? config.data : null,
        me: me.ok ? me.data : null,
        error: config.ok ? null : errorText(config.error),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);
  return [boot, (me) => setBoot((b) => ({ ...b, me }))];
}
