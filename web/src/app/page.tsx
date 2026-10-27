import Link from "next/link";

// Players of the mock server's scenario (docs/api/fixtures/scenarios/three-friends.json).
const PLAYERS = [
  { id: "1", name: "Lym", note: "ghế 1 · ván đầu cầm 7–2" },
  { id: "2", name: "An", note: "ghế 3" },
  { id: "3", name: "Bình", note: "ghế 5" },
];

export default function Home() {
  return (
    <main className="club-theme min-h-screen px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">POKER FRIENDS · TRANG THỬ</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl">Vào bàn với mock server</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Chạy mock server trước (<code>uv run python -m mockserver</code>), rồi chọn mình là ai. Ai không mở trang thì
          là bot. Mở thêm tab khác để chơi cùng lúc hai người.
        </p>
        <ul className="mt-8 grid gap-3">
          {PLAYERS.map((p) => (
            <li key={p.id}>
              <Link
                href={`/table?player=${p.id}`}
                className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 hover:border-[var(--accent)]"
              >
                <span className="text-lg font-bold">{p.name}</span>
                <span className="text-sm text-[var(--muted)]">{p.note}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/table"
              className="flex items-center justify-between rounded-2xl border border-dashed border-[var(--line)] px-5 py-4 hover:border-[var(--accent)]"
            >
              <span className="font-bold">Chỉ xem</span>
              <span className="text-sm text-[var(--muted)]">không ngồi ghế nào</span>
            </Link>
          </li>
        </ul>
        <Link
          href="/account"
          className="mt-8 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-5 py-4 hover:border-[var(--accent)]"
        >
          <span className="font-bold">Tài khoản</span>
          <span className="text-sm text-[var(--muted)]">đăng ký, đăng nhập, khách, nâng cấp</span>
        </Link>
      </div>
    </main>
  );
}
