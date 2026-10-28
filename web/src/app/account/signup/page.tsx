import { SignupPage } from "@/account/AuthPages";
import { safeNext } from "@/account/members";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Params }) {
  const { next } = await searchParams;
  return <SignupPage next={typeof next === "string" ? safeNext(next) : null} />;
}
