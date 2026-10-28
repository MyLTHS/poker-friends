// D1 typefaces (design/c1/src/directions/d1/style.css): Josefin Sans for titles, the wordmark,
// card ranks and single big numbers; Be Vietnam Pro for every UI text and for numbers that line
// up in lists. Both carry the vietnamese subset so stacked marks (ầ, ặ, ữ) render from the font.
// next/font self-hosts the files at build time: no request to Google from the browser.
import { Be_Vietnam_Pro, Josefin_Sans } from "next/font/google";

export const josefin = Josefin_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-josefin",
});

export const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
  variable: "--font-be-vietnam",
});

/** Put on <html>: defines --font-josefin and --font-be-vietnam for tokens.css. */
export const fontVariables = `${josefin.variable} ${beVietnam.variable}`;
