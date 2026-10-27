import type { ReactNode } from "react";

import { FRAME, type Device } from "./screens";

/** A fixed-size artboard; `scale` shrinks it for thumbnails without changing its layout. */
export function Frame({ device, scale = 1, children }: { device: Device; scale?: number; children: ReactNode }) {
  const { width, height } = FRAME[device];
  return (
    <div style={{ width: width * scale, height: height * scale, overflow: "hidden", flex: "none" }}>
      <div
        style={{ width, height, overflow: "hidden", position: "relative", transform: `scale(${scale})`, transformOrigin: "0 0" }}
      >
        {children}
      </div>
    </div>
  );
}
