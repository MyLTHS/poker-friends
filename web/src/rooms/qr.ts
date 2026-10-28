// QR code of an invite link: qrcode-generator (MIT, no dependencies) builds the matrix, the D1
// <QR> of @/ui draws it. Error correction H: the spade covering the centre still scans.

import qrcode from "qrcode-generator";

export function qrModules(text: string): boolean[][] {
  const code = qrcode(0, "H");
  code.addData(text, "Byte");
  code.make();
  const n = code.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => code.isDark(r, c)));
}
