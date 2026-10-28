// What the lobby (D1 "lobby" screen) shows about each room, and how it filters the list.

import type { LobbyRoom } from "./api";

export type LobbyFilter = "all" | "public" | "mine" | "open";

/** LobbyRoom has the owner's name, not their id: a namesake only gets the "Bàn của bạn" label,
 *  never any power (the server checks the owner on every call). */
export const isMine = (row: LobbyRoom, myName: string | null) => myName !== null && row.owner_name === myName;

const hasSeat = (row: LobbyRoom) => row.seated < row.room.max_seats;

export function matches(row: LobbyRoom, filter: LobbyFilter, myName: string | null): boolean {
  if (filter === "public") return !row.is_private;
  if (filter === "mine") return isMine(row, myName);
  if (filter === "open") return hasSeat(row) && row.room.status !== "closed";
  return true;
}

/** Search by room or owner name, accents and case ignored ("ban thu sau" finds "Bàn thứ Sáu"). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

/** The rooms to show: matching ones, the viewer's own first (otherwise the server's order). */
export function filterRooms(rows: LobbyRoom[], { query, filter, myName }: { query: string; filter: LobbyFilter; myName: string | null }) {
  const q = fold(query);
  const shown = rows.filter(
    (row) => matches(row, filter, myName) && (!q || fold(row.room.name).includes(q) || fold(row.owner_name ?? "").includes(q)),
  );
  return [...shown.filter((row) => isMine(row, myName)), ...shown.filter((row) => !isMine(row, myName))];
}

export const filterCount = (rows: LobbyRoom[], filter: LobbyFilter, myName: string | null) =>
  rows.filter((row) => matches(row, filter, myName)).length;

export type RoomCta = { label: string; short: string; kind: "primary" | "ghost" | "quiet"; note: string; watch: boolean };

/** The button of a room card / row. Every one opens the room page; the words say what is there. */
export function roomCta(row: LobbyRoom, myName: string | null): RoomCta {
  const left = row.room.max_seats - row.seated;
  if (isMine(row, myName)) return { label: "Về bàn", short: "Về bàn", kind: "primary", note: "Bạn là chủ phòng", watch: false };
  if (row.room.status === "closed") return { label: "Xem lịch sử", short: "Xem", kind: "quiet", note: "Phòng đã đóng", watch: true };
  if (left <= 0) return { label: "Vào xem", short: "Xem", kind: "quiet", note: "Hết ghế · vào xem được", watch: true };
  if (row.seated === 0) return { label: "Ngồi đầu tiên", short: "Ngồi", kind: "ghost", note: "Bàn đang trống", watch: false };
  return { label: "Ngồi vào", short: "Ngồi", kind: "ghost", note: `Còn ${left} ghế`, watch: false };
}

/** The invite token in what a player pasted: the whole link (any host), "?token=…", or the token
 *  alone (secrets.token_urlsafe: letters, digits, - and _). */
export function inviteToken(pasted: string): string | null {
  const text = pasted.trim();
  if (!text) return null;
  const inQuery = /[?&]token=([^&#\s]+)/.exec(text);
  if (inQuery) return decodeURIComponent(inQuery[1]);
  return /^[A-Za-z0-9_-]{8,}$/.test(text) ? text : null;
}

export const STATUS_TEXT: Record<LobbyRoom["room"]["status"], string> = {
  open: "Đang mở",
  playing: "Đang chơi",
  suspended: "Tạm dừng",
  closed: "Đã đóng",
};
