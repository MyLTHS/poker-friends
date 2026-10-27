import { useState } from "react";
import { ArrowLeft, ChevronRight, MessageSquare, Radio, Settings2, Sparkles, X } from "lucide-react";
import { players, type Player } from "./data";
import { ChipAmount, formatChipText } from "./chips";

const board = ["10♥", "J♣", "4♦", "K♠"];

function GridCard({ value, large = false, back = false }: { value: string; large?: boolean; back?: boolean }) {
  const red = value.includes("♥") || value.includes("♦");
  return <span className={`grid-playing-card ${red ? "red" : ""} ${large ? "large" : ""} ${back ? "back" : ""}`}>
    {back ? <i>◆</i> : <><b>{value.slice(0, -1)}</b><i>{value.slice(-1)}</i></>}
  </span>;
}

function statusLabel(player: Player) {
  if (player.state === "turn") return "LƯỢT CỦA BẠN";
  if (player.state === "offline") return "MẤT MẠNG";
  if (player.state === "sitout") return "TẠM NGHỈ";
  if (player.state === "folded") return "ĐÃ BỎ";
  if (player.state === "empty") return "MỜI BẠN";
  return "SẴN SÀNG";
}

function GridPlayer({ player, index, mobile = false }: { player: Player; index: number; mobile?: boolean }) {
  const empty = player.state === "empty";
  return <article className={`grid-player grid-seat-${index + 1} ${player.state ? `is-${player.state}` : ""} ${mobile ? "is-mobile" : ""}`}>
    <span className="grid-avatar">{empty ? "+" : player.avatar}</span>
    {player.state === "turn" && <span className="grid-turn-ring"><b>14</b></span>}
    <div className="grid-player-copy"><strong>{player.name}</strong>{empty ? <small>{statusLabel(player)}</small> : <ChipAmount value={player.stack} />}</div>
    {!empty && player.state !== "folded" && !player.cards && <span className="grid-hole-cards"><GridCard value="" back /><GridCard value="" back /></span>}
    {index === 4 && <span className="grid-button-marker">D</span>}
    {index === 5 && <span className="grid-button-marker blind">SB</span>}
    {index === 6 && <span className="grid-button-marker blind">BB</span>}
    {!empty && index !== 6 && <span className="grid-player-bet"><i /><i /><i /><ChipAmount value={[20, 40, 60, 80, 20, 120, 240, 40, 20][index]} /></span>}
  </article>;
}

function GridActions({ mobile = false }: { mobile?: boolean }) {
  const [raise, setRaise] = useState(240);
  const [notice, setNotice] = useState("");
  return <section className={`grid-actions ${mobile ? "grid-actions-mobile" : ""}`}>
    <div className="grid-bet-head"><span>MỨC TỐ</span><ChipAmount value={raise} /></div>
    <input aria-label="Mức tố" type="range" min="80" max="1540" step="20" value={raise} onChange={(event) => setRaise(Number(event.target.value))} />
    <div className="grid-shortcuts">
      {([["½ POT", 240], ["¾ POT", 360], ["POT", 480], ["ALL IN", 1540]] as const).map(([label, value]) => <button key={label} onClick={() => setRaise(value)}>{label}</button>)}
    </div>
    <div className="grid-action-buttons"><button className="fold" onClick={() => setNotice("Bạn đã bỏ bài")}>BỎ BÀI</button><button onClick={() => setNotice("Bạn đã check")}>CHECK</button><button className="raise" onClick={() => setNotice(`Đã tố ${formatChipText(raise)}`)}>TỐ</button></div>
    {notice && <button className="grid-notice" onClick={() => setNotice("")}>{notice}<X size={14} /></button>}
  </section>;
}

function GridCenter({ compact = false }: { compact?: boolean }) {
  return <div className={`grid-table-core ${compact ? "compact" : ""}`}>
    <div className="grid-table-felt">
      <div className="grid-pot-pile"><i /><i /><i /><span>POT</span><ChipAmount value={480} /></div>
      <div className="grid-community">{board.map((value) => <GridCard key={value} value={value} large={!compact} />)}<span className="grid-card-slot">?</span></div>
      <p>KHÔI THEO <ChipAmount value={120} /></p>
    </div>
    {players.map((player, index) => <GridPlayer key={player.name} player={player} index={index} mobile={compact} />)}
  </div>;
}

function GridCelebration() {
  return <div className="grid-celebration"><div className="grid-rays" aria-hidden="true" /><div className="grid-win-content">
    <span className="grid-win-kicker"><Sparkles size={16} /> BLUFF 7–2 · THẮNG</span><h2>Linh vừa diễn quá đạt!</h2><p>Mọi người đã bỏ bài. 7–2 được tự động lật cho cả bàn.</p>
    <div className="grid-win-cards"><GridCard value="7♥" large /><GridCard value="2♠" large /></div><div className="grid-bonus"><span>8 người × <ChipAmount value={50} /></span><ChipAmount value={400} sign="plus" /></div><button>VÁN TIẾP THEO <ChevronRight size={18} /></button>
  </div></div>;
}

export function GridDesktopTable({ celebration = false }: { celebration?: boolean }) {
  const [chat, setChat] = useState(false);
  return <div className="grid-game-shell">
    <header className="grid-game-header"><button aria-label="Quay lại"><ArrowLeft /></button><div><span>ROOM / PF-9XK2</span><b>THỨ SÁU VUI VẺ</b></div><div className="grid-game-meta"><span><Radio size={13} /> VÁN #1843</span><span>BLIND <ChipAmount value={10} /> / <ChipAmount value={20} /></span><button><Settings2 /></button></div></header>
    <main className="grid-game-layout-v3"><section className="grid-arena"><GridCenter />{celebration && <GridCelebration />}</section>{!celebration && <GridActions />}{!celebration && <button className="grid-chat-toggle" onClick={() => setChat(!chat)}><MessageSquare /> CHAT <b>3</b></button>}{chat && <aside className="grid-chat-popover"><button onClick={() => setChat(false)}><X /></button><b>CHAT / 03 TIN MỚI</b><p><strong>Trâm</strong> Linh nghĩ lâu thế 👀</p><p><strong>Duy</strong> Tôi theo nhé 😄</p></aside>}</main>
  </div>;
}

export function GridMobileTable() {
  const [chat, setChat] = useState(false);
  return <div className="phone-wrap grid-phone-wrap landscape-wrap"><div className="phone grid-phone landscape-phone grid-landscape-phone">
    <div className="phone-notch" aria-hidden="true" />
    <header className="grid-mobile-head"><button><ArrowLeft /></button><div><small>PF-9XK2 · VÁN 1843</small><b>THỨ SÁU VUI VẺ</b></div><span><ChipAmount value={10} /> / <ChipAmount value={20} /></span><button onClick={() => setChat(!chat)}><MessageSquare /></button></header>
    <div className="grid-landscape-play"><section className="grid-mobile-arena"><GridCenter compact /></section><aside className="grid-mobile-dock"><div className="grid-mobile-hand"><span>BÀI CỦA BẠN</span><div><GridCard value="A♠" large /><GridCard value="J♠" large /></div><ChipAmount value={1540} /></div><GridActions mobile /></aside></div>
    {chat && <div className="grid-mobile-chat"><button onClick={() => setChat(false)}><X /></button><b>CHAT / 03 TIN MỚI</b><p><strong>Trâm</strong> Linh nghĩ lâu thế 👀</p><p><strong>Duy</strong> Tôi theo nhé 😄</p></div>}
  </div></div>;
}
