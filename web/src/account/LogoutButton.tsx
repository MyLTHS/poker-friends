"use client";

import { useState, type ReactNode } from "react";
import { LogOut, TriangleAlert } from "lucide-react";

import { Button, Modal } from "@/ui";

import type { AuthApi, Me } from "./api";
import { NoticeAlert } from "./frame";
import { useSubmit } from "./ui";

/** Log out; a guest is asked first, since logging a guest out loses that account and its chips. */
export function LogoutButton({
  api,
  onDone,
  guest = false,
  children = "Đăng xuất",
  ...look
}: {
  api: AuthApi;
  onDone: (me: Me | null, text?: string) => void;
  guest?: boolean;
  children?: ReactNode;
  kind?: "danger" | "quiet" | "ghost";
  size?: "sm" | "md" | "lg";
  block?: boolean;
}) {
  const submit = useSubmit();
  const [asking, setAsking] = useState(false);
  const logout = async () => {
    const result = await submit.run(() => api.logout());
    if (result.ok) onDone(null, "Đã đăng xuất.");
    else setAsking(false);
  };
  return (
    <>
      <NoticeAlert notice={submit.notice} />
      <Button
        kind={look.kind ?? "danger"}
        size={look.size}
        block={look.block}
        busy={submit.busy && !asking}
        icon={<LogOut size={16} aria-hidden />}
        onClick={() => (guest ? setAsking(true) : void logout())}
      >
        {children}
      </Button>
      {guest && (
        <Modal
          open={asking}
          onClose={() => setAsking(false)}
          icon={<TriangleAlert size={28} strokeWidth={1.8} className="modal-icon" aria-hidden />}
          title="Rời tài khoản khách?"
          actions={
            <>
              <Button kind="ghost" onClick={() => setAsking(false)}>
                Ở lại
              </Button>
              <Button kind="danger" busy={submit.busy} onClick={() => void logout()}>
                Rời và mất chip
              </Button>
            </>
          }
        >
          Khách chỉ lưu trên trình duyệt này. Đăng xuất là mất tài khoản khách này cùng chip của nó ở mọi
          phòng. Muốn giữ thì nâng cấp trước.
        </Modal>
      )}
    </>
  );
}
