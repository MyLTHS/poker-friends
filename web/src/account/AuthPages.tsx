"use client";

// Client roots of /account/signup and /account/forgot: they need the auth config (Google on or
// off, and the csrftoken cookie it sets) and send a logged-in member to the profile instead.
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { createAuthApi } from "./api";
import { ForgotScreen } from "./ForgotScreens";
import { SignupScreen } from "./SignupScreen";
import { useAuthBoot } from "./useAuthBoot";

export function SignupPage() {
  const api = useMemo(() => createAuthApi(), []);
  const [boot] = useAuthBoot(api);
  useMembersToProfile(boot.me !== null && !boot.me.is_guest);
  return <SignupScreen api={api} googleEnabled={boot.config?.google_enabled ?? false} />;
}

export function ForgotPage() {
  const api = useMemo(() => createAuthApi(), []);
  useAuthBoot(api);
  return <ForgotScreen api={api} />;
}

function useMembersToProfile(member: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (member) router.replace("/account");
  }, [member, router]);
}
