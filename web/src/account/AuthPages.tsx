"use client";

// Client roots of /account/signup and /account/forgot: they need the auth config (Google on or
// off, and the csrftoken cookie every POST needs), so their forms wait for it (`ready`). Anyone
// logged in leaves the signup for /account: a member sees the profile, a guest the upgrade (a new
// account would leave the guest's chips behind).
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { createAuthApi } from "./api";
import { rememberNext } from "./members";
import { ForgotScreen } from "./ForgotScreens";
import { SignupScreen } from "./SignupScreen";
import { useAuthBoot } from "./useAuthBoot";

/** `next`: already checked by safeNext (app/account/signup/page.tsx); the new account goes there
 *  at once (remembered too, for a signup through Google). */
export function SignupPage({ next = null }: { next?: string | null }) {
  const api = useMemo(() => createAuthApi(), []);
  const [boot] = useAuthBoot(api);
  useLoggedInToAccount(boot.me !== null);
  useEffect(() => rememberNext(next), [next]);
  return (
    <SignupScreen
      api={api}
      googleEnabled={boot.config?.google_enabled ?? false}
      ready={boot.loaded}
      membersOnly={boot.config?.guests_allowed === false}
      next={next}
    />
  );
}

export function ForgotPage() {
  const api = useMemo(() => createAuthApi(), []);
  const [boot] = useAuthBoot(api);
  return <ForgotScreen api={api} ready={boot.loaded} />;
}

function useLoggedInToAccount(loggedIn: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (loggedIn) router.replace("/account");
  }, [loggedIn, router]);
}
