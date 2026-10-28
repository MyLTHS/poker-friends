"use client";

// "Gửi phản hồi": kind (Lỗi / Ý tưởng / Khác) and a message, sent with the page and its room to
// POST /api/feedback/. Not logged in (401): play as a guest and send, or go and log in. Too many
// (429): says how long to wait. Sent: closes and thanks with a toast. Needs a <ToastProvider>
// above it (FeedbackButton brings one; the table screen has its own).
// Imports name the ui files, not "@/ui": ui/shell.tsx renders FeedbackButton.
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { LogIn, Send, UserRound } from "lucide-react";

import { errorText } from "@/account/messages";
import { Alert, Button } from "@/ui/controls";
import { Modal, useToast } from "@/ui/surfaces";

import { KINDS, MESSAGE_MAX, createFeedbackApi, roomIdFromPath, type FeedbackKind, type FeedbackRequest } from "./api";

import "./feedback.css";

type Problem = { kind: "login" } | { kind: "error"; text: string } | null;

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useMemo(() => createFeedbackApi(), []);
  const toast = useToast();
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [empty, setEmpty] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const notice = useRef<HTMLDivElement>(null);
  const id = useId();
  const length = message.trim().length;

  // Open: the message box takes the focus (the dialog has just opened, in the child's effect).
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  // A problem the player must read moves the focus to it.
  useEffect(() => {
    if (problem) notice.current?.focus();
  }, [problem]);

  const close = () => {
    setProblem(null);
    setEmpty(false);
    onClose();
  };

  async function send(asGuest = false) {
    if (length === 0) {
      setEmpty(true);
      box.current?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    if (asGuest) {
      const guest = await api.createGuest();
      if (!guest.ok) {
        setBusy(false);
        setProblem({ kind: "error", text: errorText(guest.error, guest.retryAfter) });
        return;
      }
    }
    const path = window.location.pathname; // no query: links carry tokens there
    const body: FeedbackRequest = { kind, message: message.trim(), page: path };
    const room = roomIdFromPath(path);
    let result = await api.send(room === null ? body : { ...body, room_id: room });
    // a room this player cannot see (a private one, left): send it without the room
    if (!result.ok && result.error.fields?.room_id) result = await api.send(body);
    setBusy(false);
    if (result.ok) {
      setMessage("");
      close();
      toast({ kind: "success", title: "Cảm ơn bạn!", text: "Đã gửi phản hồi. Mình đọc hết sau buổi chơi." });
      return;
    }
    const { error, retryAfter } = result;
    if (error.code === "not_authenticated") setProblem({ kind: "login" });
    else if (error.code === "rate_limited") {
      const minutes = Math.max(1, Math.ceil((retryAfter ?? 60) / 60));
      setProblem({ kind: "error", text: `Bạn đã gửi nhiều phản hồi trong giờ qua. Đợi khoảng ${minutes} phút rồi gửi tiếp nhé.` });
    } else setProblem({ kind: "error", text: errorText(error) });
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Gửi phản hồi"
      actions={
        <>
          <Button kind="ghost" onClick={close}>
            Đóng
          </Button>
          <Button type="submit" form={`${id}-form`} kind="primary" busy={busy} icon={<Send size={16} strokeWidth={2} aria-hidden />}>
            Gửi
          </Button>
        </>
      }
    >
      <form id={`${id}-form`} className="fb-form" onSubmit={onSubmit} noValidate>
        <p className="fb-intro">Gặp lỗi, có ý tưởng hay muốn nhắn gì cho người làm game? Trang bạn đang mở được gửi kèm.</p>
        <fieldset className="fb-kinds">
          <legend className="field-label">Loại</legend>
          <span className="seg seg-fill">
            {KINDS.map((k) => (
              <label key={k.value} className={`seg-item${kind === k.value ? " is-active" : ""}`}>
                <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
                {k.label}
              </label>
            ))}
          </span>
        </fieldset>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-message`}>
            <span>Nội dung</span>
            <em id={`${id}-count`} className={length > MESSAGE_MAX ? "is-over" : ""}>
              {length}/{MESSAGE_MAX}
            </em>
          </label>
          <span className={`input is-area${empty ? " is-error" : ""}`}>
            <textarea
              ref={box}
              id={`${id}-message`}
              name="message"
              rows={5}
              maxLength={MESSAGE_MAX}
              required
              placeholder={kind === "bug" ? "Chuyện gì xảy ra? Lúc đó bạn đang làm gì?" : "Viết ở đây…"}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (e.target.value.trim()) setEmpty(false);
              }}
              aria-invalid={empty || undefined}
              aria-describedby={`${id}-count${empty ? ` ${id}-empty` : ""}`}
            />
          </span>
          {empty && (
            <span id={`${id}-empty`} className="field-hint is-error">
              Viết vài chữ rồi hãy gửi nhé.
            </span>
          )}
        </div>
        {problem && (
          <div ref={notice} tabIndex={-1} className="fb-problem">
            {problem.kind === "login" ? (
              <>
                <Alert kind="error" title="Cần đăng nhập để gửi (khách cũng được)" />
                <span className="fb-login">
                  <Button kind="primary" size="sm" busy={busy} icon={<UserRound size={15} strokeWidth={2} aria-hidden />} onClick={() => void send(true)}>
                    Chơi bằng khách rồi gửi
                  </Button>
                  <Link href="/account" className="link" onClick={close}>
                    <LogIn size={14} strokeWidth={2} aria-hidden /> Đăng nhập
                  </Link>
                </span>
              </>
            ) : (
              <Alert kind="error" title={problem.text} />
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
