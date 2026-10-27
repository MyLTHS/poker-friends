import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { ChipAmount, formatChipText } from "../chips";

export type BetPreset = { label: string; value: number };

type ActionBarProps = {
  mobile?: boolean;
  minRaise: number;
  maxRaise: number;
  step: number;
  initialRaise: number;
  presets: BetPreset[];
  onAction?: (action: "fold" | "check" | "raise", amount?: number) => void;
};

export function ActionBar({ mobile = false, minRaise, maxRaise, step, initialRaise, presets, onAction }: ActionBarProps) {
  const [raise, setRaise] = useState(initialRaise);
  const [acted, setActed] = useState("");
  const act = (action: "fold" | "check" | "raise") => {
    const notice = action === "fold" ? "Bạn đã chọn Bỏ bài" : action === "check" ? "Bạn đã Check" : `Đã tố ${formatChipText(raise)}`;
    setActed(notice);
    onAction?.(action, action === "raise" ? raise : undefined);
  };

  return (
    <div className={`actionbar ${mobile ? "actionbar-mobile" : ""}`}>
      <div className="quick-bets"><span>TỐ LÊN</span>{presets.map(({ label, value }) => <button key={label} onClick={() => setRaise(value)}>{label}</button>)}</div>
      <div className="range-row">
        <input aria-label="Mức tố" type="range" min={minRaise} max={maxRaise} step={step} value={raise} onChange={(event) => setRaise(Number(event.target.value))} />
        <div className="raise-value"><ChipAmount value={raise} /> <ChevronDown size={14} /></div>
      </div>
      <div className="action-buttons">
        <button className="btn btn-danger" onClick={() => act("fold")}>BỎ BÀI</button>
        <button className="btn btn-secondary" onClick={() => act("check")}>CHECK</button>
        <button className="btn btn-primary" onClick={() => act("raise")}>TỐ <ChipAmount value={raise} /></button>
      </div>
      {acted && <button className="toast" onClick={() => setActed("")}>{acted} <X size={14} /></button>}
    </div>
  );
}
