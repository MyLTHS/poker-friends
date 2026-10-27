// GENERATED from docs/api/schema/ by web/scripts/gen-api-types.mjs. Do not edit by hand:
// change the contract in docs/api/ and run `npm run api:gen` in web/.

/**
 * Any message the server sends. The type field tells which one.
 */
export type ServerMessage =
  | TableSnapshotMessage
  | HandStartedMessage
  | ActionAppliedMessage
  | TurnDeadlineMessage
  | HandCompletedMessage
  | SeatUpdatedMessage
  | RoomSuspendedMessage
  | RoomUpdatedMessage
  | CommandAckMessage
  | CommandRejectedMessage
  | ProtocolErrorMessage;
/**
 * Version of this protocol. Bumped only on a breaking change.
 */
export type ProtocolVersion = 1;
export type RoomId = number;
/**
 * The hand running when the message was sent, or null between hands.
 */
export type HandIdOrNull = number | null;
/**
 * Room event counter. Every state event adds exactly 1; replies carry the current value.
 */
export type Version = number;
/**
 * UTC instant in ISO 8601 with a trailing Z, e.g. 2026-10-27T14:03:05.120Z.
 */
export type ServerTime = string;
export type Chips = number;
/**
 * String form of the user's id (str(User.pk)), the id the engine uses.
 */
export type PlayerId = string;
export type SeatNumber = number;
/**
 * Database id of the hand (Hand.pk), not the hand number within the room.
 */
export type HandId = number;
/**
 * A face-up card; never ??.
 */
export type VisibleCard = string;
/**
 * Rank (2-9, T, J, Q, K, A) then suit (c, d, h, s), e.g. As, 7h. A hidden card is ??.
 */
export type Card = string;
/**
 * One applied action. Like command.act: fold, check and call have no amount; raise has the total raised to. timeout is true when the server acted because the clock ran out.
 */
export type AppliedAction =
  | {
      player_id: PlayerId;
      seat: SeatNumber;
      kind: "fold" | "check" | "call";
      amount: null;
      timeout: boolean;
    }
  | {
      player_id: PlayerId;
      seat: SeatNumber;
      kind: "raise";
      amount: number;
      timeout: boolean;
    };
/**
 * Created by the client once per intent and resent unchanged on every retry. A UUID v4 is recommended.
 */
export type CommandId = string;
/**
 * Stable reason a command was refused. See the table in docs/api/ws-protocol.md.
 */
export type RejectCode =
  | "invalid_command"
  | "command_id_reused"
  | "no_active_hand"
  | "stale_hand"
  | "not_seated"
  | "not_your_turn"
  | "cannot_fold"
  | "cannot_check"
  | "nothing_to_call"
  | "cannot_raise"
  | "invalid_amount"
  | "already_sitting_out"
  | "not_sitting_out"
  | "rate_limited"
  | "room_suspended"
  | "internal_error";
/**
 * Why a message without a usable command_id could not be handled.
 */
export type ProtocolErrorCode = "invalid_json" | "invalid_message" | "unknown_type" | "unsupported_protocol_version";
/**
 * Any message the client sends. The type field tells which one.
 */
export type ClientMessage = ActCommandMessage | SitOutCommandMessage | SitInCommandMessage | ResyncRequestMessage;

/**
 * Every WebSocket message, by direction. See docs/api/ws-protocol.md.
 */
export interface Protocol {
  server: ServerMessage;
  client: ClientMessage;
}
/**
 * Full table state for one receiver. Sent on connect and in reply to resync.request. Replaces everything the client holds; version is the room's current version.
 */
export interface TableSnapshotMessage {
  protocol_version: ProtocolVersion;
  type: "table.snapshot";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    table: TableState;
  };
}
/**
 * Everything a client needs to draw the table from scratch, projected for one receiver.
 */
export interface TableState {
  room: RoomInfo;
  /**
   * The receiver. seat is null for a spectator.
   */
  you: {
    player_id: PlayerId;
    seat: SeatNumber | null;
  };
  /**
   * Occupied seats only, ordered by seat.
   *
   * @maxItems 9
   */
  seats: SeatOccupant[];
  hand: HandView | null;
  turn: Turn | null;
}
export interface RoomInfo {
  room_id: RoomId;
  name: string;
  status: "open" | "playing" | "suspended" | "closed";
  max_seats: number;
  small_blind: number;
  big_blind: number;
  think_time_seconds: number;
  seven_deuce_bonus: Chips;
}
/**
 * Who sits in a seat. stack is the room balance from the ledger: during a hand it is the balance before that hand; the live stack is in HandView.
 */
export interface SeatOccupant {
  seat: SeatNumber;
  player_id: PlayerId;
  display_name: string;
  stack: Chips;
  sitting_out: boolean;
  connected: boolean;
}
/**
 * The hand as one receiver may see it: HandEngine.view_for(receiver) plus hand_id and hand_no. Spectators get view_for(None).
 */
export interface HandView {
  hand_id: HandId;
  hand_no: number;
  button_seat: SeatNumber;
  small_blind: number;
  big_blind: number;
  /**
   * @maxItems 5
   */
  board: VisibleCard[];
  pots: Pot[];
  /**
   * @minItems 2
   * @maxItems 9
   */
  players: [HandPlayer, HandPlayer, ...HandPlayer[]];
  /**
   * The player to act, or null when nobody is (hand complete).
   */
  actor: PlayerId | null;
  /**
   * Only for the receiver when they are the actor; null for everyone else.
   */
  legal_actions: LegalActions | null;
  complete: boolean;
}
export interface Pot {
  amount: Chips;
  eligible: PlayerId[];
}
/**
 * One player in the hand as the receiver may see them. cards hold ?? for every card the receiver may not see; they are empty once the player folded.
 */
export interface HandPlayer {
  player_id: PlayerId;
  seat: SeatNumber;
  stack: Chips;
  bet: Chips;
  in_hand: boolean;
  /**
   * @maxItems 2
   */
  cards: Card[];
}
/**
 * What the player to act may do, computed by the server (HandEngine.legal_actions).
 */
export interface LegalActions {
  can_fold: boolean;
  can_check: boolean;
  call_amount: Chips;
  min_raise_to: number | null;
  max_raise_to: number | null;
}
/**
 * Whose turn it is and when the server acts for them (check if free, otherwise fold).
 */
export interface Turn {
  player_id: PlayerId;
  seat: SeatNumber;
  deadline: ServerTime;
  think_time_seconds: number;
}
/**
 * State event: a new hand was dealt. Each receiver sees only their own hole cards. Always about one hand, so hand_id is never null.
 */
export interface HandStartedMessage {
  protocol_version: ProtocolVersion;
  type: "hand.started";
  room_id: RoomId;
  hand_id: HandId;
  version: Version;
  server_time: ServerTime;
  payload: {
    hand: HandView;
  };
}
/**
 * State event: one action was applied. hand is the state right after it (new board cards included), projected for the receiver. Always about one hand, so hand_id is never null.
 */
export interface ActionAppliedMessage {
  protocol_version: ProtocolVersion;
  type: "action.applied";
  room_id: RoomId;
  hand_id: HandId;
  version: Version;
  server_time: ServerTime;
  payload: {
    action: AppliedAction;
    hand: HandView;
  };
}
/**
 * State event: a player must act before deadline. legal_actions are in the last HandView the actor received. Always about one hand, so hand_id is never null.
 */
export interface TurnDeadlineMessage {
  protocol_version: ProtocolVersion;
  type: "turn.deadline";
  room_id: RoomId;
  hand_id: HandId;
  version: Version;
  server_time: ServerTime;
  payload: {
    turn: Turn;
  };
}
/**
 * State event: the hand is over and settled. Cards shown at showdown, and the 7-2 winner's two cards, are visible to everyone; folded cards stay hidden. Always about one hand, so hand_id is never null.
 */
export interface HandCompletedMessage {
  protocol_version: ProtocolVersion;
  type: "hand.completed";
  room_id: RoomId;
  hand_id: HandId;
  version: Version;
  server_time: ServerTime;
  payload: {
    hand: HandView;
    /**
     * @minItems 2
     */
    results: [PlayerResult, PlayerResult, ...PlayerResult[]];
    seven_deuce: SevenDeuceAward | null;
  };
}
/**
 * One player's outcome. stack is the room balance after the hand and the 7-2 bonus.
 */
export interface PlayerResult {
  player_id: PlayerId;
  seat: SeatNumber;
  /**
   * Chips won (+) or lost (-) in the pot.
   */
  hand_net: number;
  /**
   * Seven-deuce bonus received (+) or paid (-); 0 when none.
   */
  seven_deuce_net: number;
  stack: Chips;
}
/**
 * Rule #27: the pot was taken holding 7-2 after everyone else folded. The two cards are shown to the whole table. total is the sum of payments: exactly what the winner received.
 */
export interface SevenDeuceAward {
  player_id: PlayerId;
  seat: SeatNumber;
  /**
   * @minItems 2
   * @maxItems 2
   */
  cards: [VisibleCard, VisibleCard, ...VisibleCard[]];
  /**
   * The room's bonus for this hand.
   */
  bonus: number;
  /**
   * One row per player who paid; players with 0 chips left are absent.
   */
  payments: SevenDeucePayment[];
  total: Chips;
}
export interface SevenDeucePayment {
  player_id: PlayerId;
  seat: SeatNumber;
  /**
   * What this player actually paid: min(bonus, chips left after the pot).
   */
  amount: number;
}
/**
 * State event: a seat changed (taken, left, sitting out or back, chips granted, connection). occupant null means the seat is now empty.
 */
export interface SeatUpdatedMessage {
  protocol_version: ProtocolVersion;
  type: "seat.updated";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    seat: SeatNumber;
    occupant: SeatOccupant | null;
  };
}
/**
 * State event: something failed after a command was recorded (fail-stop). The room accepts no command until it is recovered; then the server closes every connection of the room and clients reconnect to a fresh table.snapshot. See ADR-001.
 */
export interface RoomSuspendedMessage {
  protocol_version: ProtocolVersion;
  type: "room.suspended";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    /**
     * recovery_needed: a recorded command could not be applied; the room must be recovered.
     */
    reason: "recovery_needed";
    /**
     * For logs and developers, not for players.
     */
    message: string;
  };
}
/**
 * State event: the room's settings or status changed (owner changed blinds or think time, the room was closed). Settings changed during a hand take effect from the next hand: this event is sent when they apply. See docs/api/ws-protocol.md.
 */
export interface RoomUpdatedMessage {
  protocol_version: ProtocolVersion;
  type: "room.updated";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    room: RoomInfo;
  };
}
/**
 * Reply to the sender only: the command was applied. duplicate is true when this command_id had already been applied and nothing was applied again. result_version is the version of the first state event the command caused; for a duplicate it is null when the server restarted since (versions are not kept across restarts), and the client relies on its snapshot instead.
 */
export interface CommandAckMessage {
  protocol_version: ProtocolVersion;
  type: "command.ack";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload:
    | {
        command_id: CommandId;
        duplicate: false;
        result_version: Version;
      }
    | {
        command_id: CommandId;
        duplicate: true;
        result_version: Version | null;
      };
}
/**
 * Reply to the sender only: the command was refused and nothing changed.
 */
export interface CommandRejectedMessage {
  protocol_version: ProtocolVersion;
  type: "command.rejected";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    command_id: CommandId;
    code: RejectCode;
    /**
     * For logs and developers, not for players.
     */
    message: string;
  };
}
/**
 * Reply to the sender only: a message could not be read well enough to find a command_id (bad JSON, unknown type, wrong protocol version).
 */
export interface ProtocolErrorMessage {
  protocol_version: ProtocolVersion;
  type: "protocol.error";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    code: ProtocolErrorCode;
    /**
     * For logs and developers, not for players.
     */
    message: string;
  };
}
/**
 * Command: the sender acts in the current hand. hand_id must be the running hand.
 */
export interface ActCommandMessage {
  protocol_version: ProtocolVersion;
  type: "command.act";
  room_id: RoomId;
  hand_id: HandId;
  command_id: CommandId;
  payload:
    | {
        kind: "fold" | "check" | "call";
        amount: null;
      }
    | {
        kind: "raise";
        amount: number;
      };
}
/**
 * Command: the sender sits out from the next hand on (keeps the seat).
 */
export interface SitOutCommandMessage {
  protocol_version: ProtocolVersion;
  type: "command.sit_out";
  room_id: RoomId;
  command_id: CommandId;
  payload: {};
}
/**
 * Command: the sender is dealt in again from the next hand.
 */
export interface SitInCommandMessage {
  protocol_version: ProtocolVersion;
  type: "command.sit_in";
  room_id: RoomId;
  command_id: CommandId;
  payload: {};
}
/**
 * The client missed a version; the server answers with table.snapshot. Not a command: it changes nothing, so it has no command_id.
 */
export interface ResyncRequestMessage {
  protocol_version: ProtocolVersion;
  type: "resync.request";
  room_id: RoomId;
  payload: {
    last_version: Version;
  };
}
