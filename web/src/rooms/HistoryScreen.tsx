"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { components } from "@/api/rest";
import { errorText, type Notice } from "@/account/messages";
import { Card, NoticeBox, Shell } from "@/account/ui";

import { createRoomsApi } from "./api";

type Data = {
  hands: components["schemas"]["HandSummary"][];
  summary: components["schemas"]["RoomSummary"]["players"];
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** /rooms/<id>/history — profit/loss table and finished hands (B8 test page). */
export function HistoryScreen({ roomId }: { roomId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const [data, setData] = useState<Data | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [hands, summary] = [await rooms.hands(roomId), await rooms.summary(roomId)];
      if (cancelled) return;
      if (!hands.ok) setNotice({ kind: "error", text: errorText(hands.error) });
      else if (!summary.ok) setNotice({ kind: "error", text: errorText(summary.error) });
      else setData({ hands: hands.data.hands, summary: summary.data.players });
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms, roomId]);

  return (
    <Shell title="Lịch sử phòng" section="PHÒNG" wide>
      <NoticeBox notice={notice} />
      {data && (
        <>
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-xl">Tổng kết lời/lỗ</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="py-2 pr-3">Người chơi</th>
                    <th className="pr-3">Được cấp</th>
                    <th className="pr-3">Số ván</th>
                    <th className="pr-3">7-2</th>
                    <th className="pr-3">Còn</th>
                    <th>Lời/lỗ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((row) => (
                    <tr key={row.player_id} className="border-t border-[var(--line)]">
                      <td className="py-2 pr-3 font-bold">{row.display_name}</td>
                      <td className="pr-3">{row.granted}</td>
                      <td className="pr-3">{row.hands_played}</td>
                      <td className="pr-3">{signed(row.seven_deuce_net)}</td>
                      <td className="pr-3">{row.balance}</td>
                      <td className={row.net >= 0 ? "text-[#6fdfa4]" : "text-[#ff8787]"}>{signed(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.summary.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">Chưa ai có chip trong phòng.</p>}
            </div>
          </Card>
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-xl">Các ván đã chơi</h2>
            <ul className="mt-3 grid gap-2">
              {data.hands.map((hand) => (
                <li key={hand.hand_id} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>
                      Ván {hand.hand_no} <span className="font-normal text-[var(--muted)]">· {time(hand.completed_at)}</span>
                    </b>
                    {hand.voided ? (
                      <span className="pill pill-red">ĐÃ HUỶ</span>
                    ) : (
                      <Link href={`/hands/${hand.hand_id}`} className="btn btn-secondary text-xs">
                        Xem lại
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-[var(--muted)]">
                    {hand.players.map((p) => `${p.display_name} ${signed(p.net)}`).join(" · ")}
                  </p>
                </li>
              ))}
              {data.hands.length === 0 && <li className="text-sm text-[var(--muted)]">Chưa có ván nào xong.</li>}
            </ul>
          </Card>
        </>
      )}
      <Link href={`/rooms/${roomId}`} className="btn btn-ghost text-sm">
        Về phòng
      </Link>
    </Shell>
  );
}
