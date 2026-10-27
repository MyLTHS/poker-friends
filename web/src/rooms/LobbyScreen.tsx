"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createAuthApi, type Me } from "@/account/api";
import { errorText, type Notice } from "@/account/messages";
import { Card, Field, formValues, NoticeBox, Shell, Submit, useSubmit } from "@/account/ui";

import { createRoomsApi, type LobbyRoom } from "./api";

/** /rooms — the lobby and the "create a room" form (B7 test page). */
export function LobbyScreen() {
  const rooms = useMemo(() => createRoomsApi(), []);
  const auth = useMemo(() => createAuthApi(), []);
  const [list, setList] = useState<LobbyRoom[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await auth.config(); // csrftoken cookie
      const [lobby, who] = [await rooms.lobby(), await auth.me()];
      if (cancelled) return;
      if (lobby.ok) setList(lobby.data.rooms);
      else setNotice({ kind: "error", text: errorText(lobby.error) });
      setMe(who.ok ? who.data : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, rooms]);

  return (
    <Shell title="Lobby" section="PHÒNG" wide>
      <NoticeBox notice={notice} />
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-xl">Phòng đang mở</h2>
        {list === null ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Đang tải…</p>
        ) : list.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Chưa có phòng nào. Tạo một phòng bên dưới.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {list.map(({ room, is_private, owner_name, seated }) => (
              <li key={room.room_id}>
                <Link
                  href={`/rooms/${room.room_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-4 py-3 hover:border-[var(--accent)]"
                >
                  <span className="font-bold">
                    {room.name} {is_private && <span className="pill pill-gold">RIÊNG</span>}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {room.small_blind}/{room.big_blind} · {seated}/{room.max_seats} ghế · chủ {owner_name ?? "?"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {me ? (
        <CreateRoom rooms={rooms} />
      ) : (
        <Card>
          <p className="text-sm text-[var(--muted)]">
            Muốn tạo phòng thì <Link href="/account" className="text-[var(--accent)] underline">đăng nhập hoặc chơi bằng khách</Link> trước.
          </p>
        </Card>
      )}
    </Shell>
  );
}

function CreateRoom({ rooms }: { rooms: ReturnType<typeof createRoomsApi> }) {
  const router = useRouter();
  const submit = useSubmit();
  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          const values = formValues(event);
          const number = (key: string) => Number(values[key]);
          const result = await submit.run(() =>
            rooms.create({
              name: values.name,
              small_blind: number("small_blind"),
              big_blind: number("big_blind"),
              max_seats: number("max_seats"),
              think_time_seconds: number("think_time_seconds"),
              seven_deuce_bonus: number("seven_deuce_bonus"),
              is_private: values.is_private === "on",
            }),
          );
          if (result.ok) router.push(`/rooms/${result.data.room.room_id}`);
        }}
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl sm:col-span-2">Tạo phòng</h2>
        <div className="sm:col-span-2">
          <NoticeBox notice={submit.notice} />
        </div>
        <div className="sm:col-span-2">
          <Field label="Tên phòng" name="name" errors={submit.fields.name} />
        </div>
        <NumberField label="Small blind" name="small_blind" value={5} errors={submit.fields.small_blind} />
        <NumberField label="Big blind" name="big_blind" value={10} errors={submit.fields.big_blind} />
        <NumberField label="Số ghế (2–9)" name="max_seats" value={9} errors={submit.fields.max_seats} />
        <NumberField label="Giây suy nghĩ (5–120)" name="think_time_seconds" value={30} errors={submit.fields.think_time_seconds} />
        <NumberField label="Thưởng 7-2 (0 = tắt)" name="seven_deuce_bonus" value={0} errors={submit.fields.seven_deuce_bonus} />
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" name="is_private" /> Phòng riêng (chỉ ai có link mời)
        </label>
        <div className="sm:col-span-2">
          <Submit busy={submit.busy}>Tạo phòng</Submit>
        </div>
      </form>
    </Card>
  );
}

export function NumberField({
  label,
  name,
  value,
  errors,
}: {
  label: string;
  name: string;
  value?: number;
  errors?: string[];
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-bold">{label}</span>
      <input
        name={name}
        type="number"
        defaultValue={value}
        required
        className="w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-4 py-3 text-[var(--ink)]"
      />
      {errors?.map((error) => (
        <span key={error} className="text-xs text-[#ff8787]">
          {error}
        </span>
      ))}
    </label>
  );
}
