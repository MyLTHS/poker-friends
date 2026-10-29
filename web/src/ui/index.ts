// D1 "Nỉ & Đồng thau" design system: import screens' building blocks from "@/ui".
// Styles come from tokens.css + d1.css (imported once in app/globals.css); every component
// must sit inside a .d1 root (D1Root / AppShell). Gallery of everything: /ui (dev only).
export { CardText, FlipCard, PlayingCard, SuitIcon } from "./cards";
export { CHIP_DENOMS, Chip, ChipStack, chipColumns } from "./chips";
export { Alert, Badge, Button, ButtonLink, Checkbox, IconButton, Strength, Tabs, TextField, Toggle } from "./controls";
export type { BadgeKind, ButtonKind } from "./controls";
export { Confetti, QR, sampleQrModules } from "./fx";
export { cardName, fmt, isRed, parseCard, signed, tone } from "./format";
export type { Face, Suit } from "./format";
export { BEAT, DURATION, EASE, REDUCED_FADE, STAGGER, fly, flyKeyframes, play, prefersReducedMotion } from "./motion";
export { Avatar, Crest, MiniTable, TimerRing, Wordmark } from "./people";
export { RotatePrompt } from "./RotatePrompt";
export { AppShell, D1Root, NAV_ITEMS, PageHead } from "./shell";
export type { Me, NavKey } from "./shell";
export { EmptyState, ErrorState, Loading, LoadingLine, Skeleton, SkeletonCard, Spinner } from "./states";
export { d1Viewport } from "./viewport";
export { Modal, Panel, Sheet, Toast, ToastProvider, useToast } from "./surfaces";
export type { ToastKind } from "./surfaces";
