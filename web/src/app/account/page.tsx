import { AccountScreen } from "@/account/AccountScreen";
import { googleResult } from "@/account/messages";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["google", "error"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  return <AccountScreen initialNotice={googleResult(query)} />;
}
