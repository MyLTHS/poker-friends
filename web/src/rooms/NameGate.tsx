"use client";

// The name gate (Poker Now's "pick a name"): a visitor nobody knows yet, on a server that takes
// guests, types the name friends will see and plays. Shown by the lobby, the create page, the
// invite link (before joining) and the table, instead of the server quietly making a guest with a
// random name on the first room call (apps/games/accounts.py). Members only, nobody sees it: the
// room API sends a stranger to the login (account/members.ts), as before.
import Link from "next/link";
import { useId, useMemo } from "react";

import { createAuthApi, type Me } from "@/account/api";
import { GuestNameForm } from "@/account/GuestNameForm";
import { herePath, loginPath } from "@/account/members";

import { useClientValue } from "./hooks";
import "./rooms.css";

/** `heading`: h1 where the gate is the page's only content, h2 under a page title. */
export function NameGate({ onDone, heading = "h1" }: { onDone: (me: Me) => void; heading?: "h1" | "h2" }) {
  const api = useMemo(() => createAuthApi(), []);
  const id = useId();
  // the login comes back here afterwards (an invite link keeps its token)
  const login = useClientValue(() => loginPath(herePath()), loginPath());
  const Heading = heading;
  return (
    <section className="name-gate" aria-labelledby={id}>
      <Heading id={id} className="name-gate-title">
        Bạn tên gì?
      </Heading>
      <GuestNameForm api={api} onDone={onDone} autoFocus />
      <p className="form-foot">
        Đã có tài khoản?{" "}
        <Link href={login} className="link">
          Đăng nhập
        </Link>
      </p>
    </section>
  );
}
