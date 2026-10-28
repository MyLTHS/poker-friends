import { redirect } from "next/navigation";

// The club opens on the lobby. (The mock server's player picker that lived here is at the foot
// of the lobby in development.)
export default function Home() {
  redirect("/rooms");
}
