import { ResetScreen } from "@/account/TokenScreens";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ uid?: string; token?: string }> }) {
  const { uid = "", token = "" } = await searchParams;
  return <ResetScreen uid={uid} token={token} />;
}
