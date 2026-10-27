import { VerifyScreen } from "@/account/TokenScreens";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <VerifyScreen token={token} key={token} />;
}
