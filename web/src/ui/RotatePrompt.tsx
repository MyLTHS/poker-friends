// Spec #28: the phone is landscape only. A phone held upright (portrait, ≤600px wide, touch)
// sees this card instead of the app; d1.css shows it by media query alone, so there is no
// JavaScript, no flash on load, and the app behind stays mounted (a live hand keeps its socket).
import { RotateCcw } from "lucide-react";

import { Crest } from "./people";

export function RotatePrompt() {
  return (
    <div className="d1 bg-auth rotate-prompt" role="alert" aria-live="polite">
      <Crest size={44} />
      <span className="rotate-art" aria-hidden>
        <RotateCcw className="rotate-arrow" size={120} strokeWidth={1} />
        <i className="rotate-phone" />
      </span>
      <span className="eyebrow">Poker Friends</span>
      <h2 className="rotate-title">Xoay ngang điện thoại</h2>
      <p className="rotate-sub">Bàn chơi cần màn hình ngang để đủ chỗ cho cả bàn, bài và nút cược. Xoay máy là vào lại đúng chỗ.</p>
    </div>
  );
}
