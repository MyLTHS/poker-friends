"use client";

// The "Gửi phản hồi" button of AppShell's bars (ui/shell.tsx): an icon button that opens
// FeedbackDialog. The bars sit outside the screens' own <ToastProvider>, so it brings its own for
// the thank-you toast. The table has no AppShell: its settings dialog opens FeedbackDialog.
import { useState } from "react";
import { MessageSquareText } from "lucide-react";

import { IconButton } from "@/ui/controls";
import { ToastProvider } from "@/ui/surfaces";

import { FeedbackDialog } from "./FeedbackDialog";

export function FeedbackButton({ size = 19 }: { size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <ToastProvider>
      <IconButton label="Gửi phản hồi" aria-haspopup="dialog" active={open} onClick={() => setOpen(true)}>
        <MessageSquareText size={size} strokeWidth={1.8} aria-hidden />
      </IconButton>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </ToastProvider>
  );
}
