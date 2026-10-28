// Client for /api/rooms/ (docs/api/openapi.yaml, tag rooms) and the B4 seat/snapshot calls.

import type { components } from "@/api/rest";

import { makeRequest } from "@/account/api";

type Schemas = components["schemas"];
export type RoomDetail = Schemas["RoomDetail"];
export type LobbyRoom = Schemas["LobbyRoom"];
export type TableSnapshot = Schemas["TableSnapshot"];
export type SeatOccupant = TableSnapshot["table"]["seats"][number];
export type HandReplay = Schemas["HandReplay"];

/**
 * Django's WebSocket for a room. An empty base (NEXT_PUBLIC_DJANGO_WS="") means the page's own
 * address: behind Caddy the page and the socket share one origin, whatever that address is
 * (a Cloudflare quick tunnel gets a new one every run, docs/choi-online.md).
 */
export function roomSocketUrl(
  base: string,
  roomId: number,
  page: Pick<Location, "protocol" | "host"> | undefined = globalThis.location,
): string {
  // No page outside a browser (server render, tests): sockets only open in the browser anyway.
  const origin = base || (page ? `${page.protocol === "https:" ? "wss:" : "ws:"}//${page.host}` : "");
  return `${origin}/ws/rooms/${roomId}/`;
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/rooms/join?token=${encodeURIComponent(token)}`;
}

export function createRoomsApi(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  cookies: () => string = () => document.cookie,
) {
  const request = makeRequest(fetchImpl, cookies);
  const room = (id: number, rest = "") => `/api/rooms/${id}/${rest}`;
  return {
    lobby: () => request<Schemas["Lobby"]>("GET", "/api/rooms/"),
    create: (body: Schemas["CreateRoomRequest"]) => request<RoomDetail>("POST", "/api/rooms/", body),
    get: (id: number) => request<RoomDetail>("GET", room(id)),
    update: (id: number, body: Schemas["UpdateRoomRequest"]) => request<RoomDetail>("PATCH", room(id), body),
    join: (token: string) => request<RoomDetail>("POST", "/api/rooms/join/", { invite_token: token }),
    grantChips: (id: number, body: Schemas["GrantChipsRequest"]) =>
      request<Schemas["GrantChipsResult"]>("POST", room(id, "chips/"), body),
    kick: (id: number, playerId: string) => request<void>("POST", room(id, "kick/"), { player_id: playerId }),
    close: (id: number) => request<RoomDetail>("POST", room(id, "close/")),
    rotateInvite: (id: number) => request<RoomDetail>("POST", room(id, "invite/")),
    snapshot: (id: number) => request<TableSnapshot>("GET", room(id, "snapshot/")),
    takeSeat: (id: number, seat: number) => request<SeatOccupant>("POST", room(id, "seats/"), { seat }),
    leaveSeat: (id: number) => request<void>("DELETE", room(id, "seats/me/")),
    chat: (id: number) => request<Schemas["ChatHistory"]>("GET", room(id, "chat/")),
    hands: (id: number) => request<Schemas["HandList"]>("GET", room(id, "hands/")),
    summary: (id: number) => request<Schemas["RoomSummary"]>("GET", room(id, "summary/")),
    replay: (handId: number) => request<Schemas["HandReplay"]>("GET", `/api/hands/${handId}/replay/`),
  };
}

export type RoomsApi = ReturnType<typeof createRoomsApi>;
