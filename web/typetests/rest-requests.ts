// Type tests for the generated REST types: they must accept exactly what docs/api/openapi.yaml
// accepts. Checked by `npm run api:check` (tsc), never run.

import type { components } from "../src/api/rest";

type CreateRoomRequest = components["schemas"]["CreateRoomRequest"];
type TakeSeatRequest = components["schemas"]["TakeSeatRequest"];

// Fields with a default (max_seats, think_time_seconds, seven_deuce_bonus) may be left out.
export const minimalRoom: CreateRoomRequest = { name: "Bàn bạn bè", small_blind: 5, big_blind: 10 };

export const fullRoom: CreateRoomRequest = {
  name: "Bàn bạn bè",
  max_seats: 6,
  small_blind: 5,
  big_blind: 10,
  think_time_seconds: 20,
  seven_deuce_bonus: 50,
};

// @ts-expect-error big_blind is required.
export const missingBigBlind: CreateRoomRequest = { name: "Bàn bạn bè", small_blind: 5 };

export const seat: TakeSeatRequest = { seat: 3 };
