import { ChipAmount } from "./chips";

export function ChipStack({ amount, className = "" }: { amount: number; className?: string }) {
  return <ChipAmount value={amount} className={["chip-stack", className].filter(Boolean).join(" ")} />;
}
