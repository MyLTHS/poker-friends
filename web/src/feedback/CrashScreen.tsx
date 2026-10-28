"use client";

// What a page shows when it crashed (app/error.tsx, app/global-error.tsx): the D1 error block and
// one way out, a reload. The error itself was already sent (browser.ts).
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/ui/controls";
import { D1Root } from "@/ui/shell";
import { ErrorState } from "@/ui/states";

import "./feedback.css";

export function CrashScreen() {
  return (
    <D1Root bg="app" className="crash">
      <main className="crash-main">
        <h1 className="sr-only">Trang gặp lỗi</h1>
        <ErrorState
          icon={<TriangleAlert size={26} strokeWidth={1.9} />}
          title="Có lỗi, tải lại trang nhé"
          text="Trang gặp lỗi không lường trước và đã báo lại để sửa. Chip và bàn của bạn vẫn an toàn."
          actions={
            <Button kind="primary" icon={<RotateCw size={17} strokeWidth={2} aria-hidden />} onClick={() => window.location.reload()}>
              Tải lại
            </Button>
          }
        />
      </main>
    </D1Root>
  );
}
