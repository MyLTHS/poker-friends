import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { ChipAmount } from "./chips";

// Copied from design/mockups/src/club/ActionBar.tsx. Added for web/: which buttons are allowed
// (from the server's legal_actions), a call button, a disabled state with a status line, and
// the notice toast is owned by the page instead of the bar.
export type BetPreset = { label: string; value: number };
export type BarAction = "fold" | "check" | "call" | "raise";

type ActionBarProps = {
  mobile?: boolean;
  minRaise: number;
  maxRaise: number;
  step: number;
  initialRaise: number;
  presets: BetPreset[];
  onAction?: (action: BarAction, amount?: number) => void;
  enabled?: boolean;
  canFold?: boolean;
  canCheck?: boolean;
  callAmount?: number;
  canRaise?: boolean;
  raiseLabel?: string;
  status?: string;
  notice?: string;
  onDismissNotice?: () => void;
};

export function ActionBar({
  mobile = false,
  minRaise,
  maxRaise,
  step,
  initialRaise,
  presets,
  onAction,
  enabled = true,
  canFold = true,
  canCheck = true,
  callAmount = 0,
  canRaise = true,
  raiseLabel = "TỐ",
  status,
  notice,
  onDismissNotice,
}: ActionBarProps) {
  const [raise, setRaise] = useState(initialRaise);
  const raiseOn = enabled && canRaise;
  const label = raiseOn && raise >= maxRaise ? "ALL-IN" : raiseLabel;

  return (
    <div className={`actionbar ${mobile ? "actionbar-mobile" : ""}`}>
      {status && <div className="actionbar-status" role="status">{status}</div>}
      <div className="quick-bets">
        <span>TỐ LÊN</span>
        {presets.map(({ label: presetLabel, value }) => (
          <button key={presetLabel} disabled={!raiseOn} onClick={() => setRaise(value)}>{presetLabel}</button>
        ))}
      </div>
      <div className="range-row">
        <input aria-label="Mức tố" type="range" min={minRaise} max={maxRaise} step={step} value={raise} disabled={!raiseOn} onChange={(event) => setRaise(Number(event.target.value))} />
        <div className="raise-value"><ChipAmount value={raise} /> <ChevronDown size={14} /></div>
      </div>
      <div className="action-buttons">
        <button className="btn btn-danger" disabled={!enabled || !canFold} onClick={() => onAction?.("fold")}>BỎ BÀI</button>
        {callAmount > 0 ? (
          <button className="btn btn-secondary" disabled={!enabled} onClick={() => onAction?.("call")}>THEO <ChipAmount value={callAmount} /></button>
        ) : (
          <button className="btn btn-secondary" disabled={!enabled || !canCheck} onClick={() => onAction?.("check")}>CHECK</button>
        )}
        <button className="btn btn-primary" disabled={!raiseOn} onClick={() => onAction?.("raise", raise)}>{label}{raiseOn && <> <ChipAmount value={raise} /></>}</button>
      </div>
      {notice && <button className="toast" onClick={onDismissNotice}>{notice} <X size={14} /></button>}
    </div>
  );
}
