import { ResetScreen } from "@/account/TokenScreens";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ uid?: string; token?: string; moi?: string }> }) {
  const { uid = "", token = "", moi } = await searchParams;
  // moi=1: the invitation link of an account made by staff (same form, words for a new player)
  return <ResetScreen uid={uid} token={token} invite={moi === "1"} />;
}
