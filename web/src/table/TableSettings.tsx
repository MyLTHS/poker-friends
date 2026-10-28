"use client";

// The table's own settings (the design's gear on desktop, "Thêm" on the phone): sound on/off and
// its volume, and the keyboard help (key ?). Also the sound player the table screen uses: it
// listens to the animation cues, my turn and my clock, and plays nothing while sound is off or
// the tab is hidden.
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, MessageSquareText, Volume2 } from "lucide-react";

import { Choices } from "@/rooms/Choices";
import { Button, Modal, Toggle } from "@/ui";

import type { Cue } from "./cues";
import { readKeysOn, SHORTCUTS, writeKeysOn } from "./shortcuts";
import { createSynth, readPrefs, soundsForCues, VOLUMES, writePrefs, type SoundName, type SoundPrefs, type Synth } from "./sound";

export type TableSound = {
  prefs: SoundPrefs;
  setPrefs: (next: SoundPrefs) => void;
  play: (name: SoundName, count?: number) => void;
};

export function useTableSound(): TableSound {
  // The table only renders on the client (after the socket's first state), so reading storage
  // in the initializer never shows a different screen than the server rendered.
  const [prefs, setState] = useState<SoundPrefs>(() => readPrefs());
  const current = useRef(prefs);
  const synth = useRef<Synth | null>(null);
  useEffect(() => {
    current.current = prefs;
  }, [prefs]);
  // Leaving the table closes the AudioContext.
  useEffect(
    () => () => {
      synth.current?.close();
      synth.current = null;
    },
    [],
  );

  const play = useCallback((name: SoundName, count?: number) => {
    const p = current.current;
    if (!p.on || typeof document === "undefined" || document.hidden) return;
    synth.current?.play(name, p.volume, count);
  }, []);

  const setPrefs = useCallback((next: SoundPrefs) => {
    current.current = next;
    setState(next);
    writePrefs(next);
    // a click or key turned it on: start audio now (allowed in a gesture) and let them hear it
    if (next.on) {
      synth.current ??= createSynth();
      synth.current.wake();
      synth.current.play("turn", next.volume);
    }
  }, []);

  // Sound kept on from a past visit: audio may start only at the first click or key.
  useEffect(() => {
    if (!prefs.on) return;
    const wake = () => {
      synth.current ??= createSynth();
      synth.current.wake();
    };
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [prefs.on]);

  return { prefs, setPrefs, play };
}

/** The single-key shortcuts switch (on by default), kept in localStorage. */
export function useKeysPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => readKeysOn());
  const set = useCallback((next: boolean) => {
    setOn(next);
    writeKeysOn(next);
  }, []);
  return [on, set];
}

/** Plays the table's moments. Renders nothing. */
export function SoundCues({
  sound,
  cues,
  mySeat,
  myTurn,
  turnKey,
  deadline,
  frozen,
}: {
  sound: TableSound;
  cues: Cue[];
  mySeat: number | null;
  myTurn: boolean;
  /** one value per turn of mine (hand + server deadline): a reconnect keeps it, so no second chime */
  turnKey: string | null;
  /** my turn's deadline in local ms (0 when none) */
  deadline: number;
  frozen: boolean;
}) {
  const { play } = sound;
  const heard = useRef(cues.at(-1)?.id ?? 0);
  useEffect(() => {
    const fresh = cues.filter((c) => c.id > heard.current);
    if (fresh.length === 0) return;
    heard.current = fresh[fresh.length - 1].id;
    for (const s of soundsForCues(fresh, mySeat)) play(s.name, s.count);
  }, [cues, mySeat, play]);

  const chimed = useRef<string | null>(null);
  useEffect(() => {
    if (!turnKey || chimed.current === turnKey) return;
    chimed.current = turnKey;
    play("turn");
  }, [turnKey, play]);

  // Five seconds left on my clock (and not yet past it).
  useEffect(() => {
    if (!myTurn || frozen || !deadline) return;
    const wait = deadline - 5000 - Date.now();
    if (wait < -4000) return;
    const timer = window.setTimeout(() => play("hurry"), Math.max(0, wait));
    return () => window.clearTimeout(timer);
  }, [myTurn, deadline, frozen, play]);
  return null;
}

export function SettingsModal({
  open,
  onClose,
  sound,
  keys,
  onHelp,
  onFeedback,
}: {
  open: boolean;
  onClose: () => void;
  sound: TableSound;
  /** desktop: the shortcuts switch */
  keys?: { on: boolean; set: (on: boolean) => void };
  onHelp: () => void;
  /** "Gửi phản hồi" (src/feedback): the table has no app bar, so it lives here */
  onFeedback?: () => void;
}) {
  const { prefs, setPrefs, play } = sound;
  return (
    <Modal open={open} onClose={onClose} title="Cài đặt bàn">
      <div className="tset">
        <div className="tset-row">
          <span className="tset-icon" aria-hidden>
            <Volume2 size={18} strokeWidth={1.9} />
          </span>
          <span className="tset-text" id="tset-sound">
            <b>Âm thanh</b>
            <small>Chia bài, tới lượt, sắp hết giờ, thắng pot, 7-2</small>
          </span>
          <Toggle on={prefs.on} label="Âm thanh" onChange={(on) => setPrefs({ ...prefs, on })} />
        </div>
        <div className={`tset-row tset-volume${prefs.on ? "" : " is-off"}`}>
          <span className="tset-text" id="tset-volume">
            <b>Âm lượng</b>
          </span>
          <Choices
            labelledBy="tset-volume"
            items={VOLUMES.map((v) => ({ value: v.value, label: v.label }))}
            value={prefs.volume}
            onChange={(volume) => {
              setPrefs({ ...prefs, volume });
              play("pot");
            }}
            className="seg"
            itemClass="seg-item"
            disabled={!prefs.on}
          />
        </div>
        {keys && (
          <>
            <div className="tset-row">
              <span className="tset-icon" aria-hidden>
                <Keyboard size={18} strokeWidth={1.9} />
              </span>
              <span className="tset-text">
                <b>Phím tắt một phím</b>
                <small>F, C, R, 1–4, mũi tên, M, ?. Tắt nếu hay lỡ tay hoặc dùng trình đọc màn hình.</small>
              </span>
              <Toggle on={keys.on} label="Phím tắt một phím" onChange={keys.set} />
            </div>
            {keys.on && (
              <div className="tset-row tset-volume">
                <span className="tset-text">
                  <small>
                    Bấm <kbd className="kbd">?</kbd> trên bàn để xem lại
                  </small>
                </span>
                <Button kind="quiet" size="sm" onClick={onHelp}>
                  Xem phím tắt
                </Button>
              </div>
            )}
          </>
        )}
        {onFeedback && (
          <div className="tset-row">
            <span className="tset-icon" aria-hidden>
              <MessageSquareText size={18} strokeWidth={1.9} />
            </span>
            <span className="tset-text">
              <b>Góp ý, báo lỗi</b>
              <small>Gửi cho người làm game, kèm bàn đang mở.</small>
            </span>
            <Button kind="quiet" size="sm" aria-haspopup="dialog" onClick={onFeedback}>
              Gửi phản hồi
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Phím tắt trên bàn">
      <p className="keys-note">Chỉ chạy khi tới lượt bạn và bạn không đang gõ chat. Mức tố luôn nằm trong mức máy chủ cho phép.</p>
      <dl className="keys">
        {SHORTCUTS.map((s) => (
          <div key={s.text}>
            <dt>
              {s.keys.map((k) => (
                <kbd key={k} className="kbd">
                  {k}
                </kbd>
              ))}
            </dt>
            <dd>{s.text}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
