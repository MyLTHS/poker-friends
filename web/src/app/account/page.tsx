import { AccountScreen } from "@/account/AccountScreen";
import { safeNext } from "@/account/members";
import { googleResult } from "@/account/messages";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["google", "error"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  // ?next=: where the login came from (account/members.ts); only this site's own paths count.
  const next = typeof params.next === "string" ? safeNext(params.next) : null;
  return <AccountScreen initialNotice={googleResult(query)} next={next} />;
}
