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
  | CardsShownMessage
  | SeatUpdatedMessage
  | RoomSuspendedMessage
  | RoomUpdatedMessage
  | CommandAckMessage
  | CommandRejectedMessage
  | ProtocolErrorMessage
  | ChatMessageMessage
  | AudienceUpdatedMessage;
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
 * Dead money every player dealt in puts in before the blinds (all of it if short); 0 = no ante.
 */
export type Chips1 = number;
/**
 * What everyone dealt in puts in for a bomb pot; above 0 whenever bomb_pot_every is.
 */
export type Chips2 = number;
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
 * The ante of this hand, taken from everyone dealt in before the blinds; 0 in a bomb pot (bomb_pot replaces it).
 */
export type Chips3 = number;
/**
 * Above 0 for a bomb pot: what everyone dealt in put in. Such a hand has no blinds and no betting before the flop: the first decision is on the flop, from the left of the button. 0 for a normal hand.
 */
export type Chips4 = number;
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
 * A made poker hand, from PokerKit's hand labels. Stable codes: the client shows its own words for them.
 */
export type HandCategory =
  | "high_card"
  | "one_pair"
  | "two_pair"
  | "three_of_a_kind"
  | "straight"
  | "flush"
  | "full_house"
  | "four_of_a_kind"
  | "straight_flush";
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
  | "hand_in_progress"
  | "not_in_hand"
  | "already_shown"
  | "rate_limited"
  | "room_suspended"
  | "internal_error";
/**
 * Why a message without a usable command_id could not be handled.
 */
export type ProtocolErrorCode =
  "invalid_json" | "invalid_message" | "unknown_type" | "unsupported_protocol_version" | "rate_limited";
/**
 * 1 to 300 characters; not blank.
 */
export type ChatText = string;
/**
 * Any message the client sends. The type field tells which one.
 */
export type ClientMessage =
  | ActCommandMessage
  | SitOutCommandMessage
  | SitInCommandMessage
  | ShowCardsCommandMessage
  | ResyncRequestMessage
  | ChatSendMessage;

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
  /**
   * Chips a player gets on sitting down with none in this room, and again on a rebuy once busted.
   */
  starting_stack: number;
  ante: Chips1;
  /**
   * Every bomb_pot_every-th hand of the room (by hand_no) is a bomb pot; 0 = never.
   */
  bomb_pot_every: number;
  bomb_pot_amount: Chips2;
  /**
   * All in before the river with the betting over (two or more players left): the rest of the board is dealt twice and each board decides half of every pot.
   */
  run_it_twice: boolean;
  /**
   * A hand over before the river shows the board cards that would have come (hand.completed rabbit_cards).
   */
  rabbit_hunt: boolean;
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
  ante: Chips3;
  bomb_pot: Chips4;
  /**
   * @maxItems 5
   */
  board: VisibleCard[];
  /**
   * The second board of a hand run twice (complete, 5 cards; the cards dealt before the all-in are on both boards), null otherwise.
   */
  second_board: [Card, Card, Card, Card, Card, ...Card[]] | null;
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
 * State event: the hand is over and settled. Cards shown at showdown, and the 7-2 winner's two cards, are visible to everyone; folded cards stay hidden. showdown names the made hand of every player whose cards are face up after a showdown. Always about one hand, so hand_id is never null.
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
    /**
     * One row per player whose cards are face up after a showdown, by seat, once per board when the hand was run twice (so up to 18); [] when the hand was won by folds.
     *
     * @maxItems 18
     */
    showdown: ShowdownHand[];
    /**
     * Both boards of a hand run twice, each with what it paid; null otherwise.
     */
    runouts: [Runout, Runout, ...Runout[]] | null;
    /**
     * Rabbit hunt (room.rabbit_hunt): for a hand over before the river, the board cards that would have come next, in order, burns skipped. Only to look at, no chips move; [] otherwise. Never sent before the hand is over.
     *
     * @maxItems 5
     */
    rabbit_cards: Card[];
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
 * The made hand of one player whose cards are face up at the end of a showdown. Never for a player who folded or mucked, nor for a win by folds (a revealed 7-2 bluff included). cards are the best five, from the player's two cards and the board, most significant first (bigger groups, then higher ranks; the ace of a five-high straight last). A hand run twice names each player once per board.
 */
export interface ShowdownHand {
  player_id: PlayerId;
  seat: SeatNumber;
  /**
   * Which board the hand is made with: 1, or 2 for the second board of a hand run twice.
   */
  board: number;
  category: HandCategory;
  /**
   * @minItems 5
   * @maxItems 5
   */
  cards: [VisibleCard, VisibleCard, VisibleCard, VisibleCard, VisibleCard, ...VisibleCard[]];
}
/**
 * One board of a hand run twice and what it paid: half of every pot (an odd chip to the first board), to the best hand on this board among the players in that pot.
 */
export interface Runout {
  /**
   * @minItems 5
   * @maxItems 5
   */
  board: [Card, Card, Card, Card, Card, ...Card[]];
  /**
   * By seat; several players when they split.
   *
   * @maxItems 9
   */
  winners: {
    player_id: PlayerId;
    seat: SeatNumber;
    amount: number;
  }[];
}
/**
 * Notice (not a state event, version unchanged, not in a snapshot): a player of the hand hand_id showed their two cards to the whole table after it ended (command.show_cards). Kept with the hand's history (replay shown_cards).
 */
export interface CardsShownMessage {
  protocol_version: ProtocolVersion;
  type: "cards.shown";
  room_id: RoomId;
  hand_id: HandId;
  version: Version;
  server_time: ServerTime;
  payload: ShownCards;
}
/**
 * Two cards a player of the last finished hand chose to show the whole table (command.show_cards).
 */
export interface ShownCards {
  player_id: PlayerId;
  seat: SeatNumber;
  /**
   * @minItems 2
   * @maxItems 2
   */
  cards: [Card, Card, ...Card[]];
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
     * A fixed sentence, not for players. The cause is in the server log only: it may name cards.
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
 * Notice (does not change version): someone in the room said something. Sent to everyone connected, the sender included. History: GET /api/rooms/{id}/chat/.
 */
export interface ChatMessageMessage {
  protocol_version: ProtocolVersion;
  type: "chat.message";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    message: ChatMessage;
  };
}
/**
 * One chat line in a room (B8). Emoji are ordinary characters in text.
 */
export interface ChatMessage {
  message_id: number;
  player_id: PlayerId;
  display_name: string;
  text: ChatText;
  sent_at: ServerTime;
}
/**
 * Notice (does not change version): who is watching without a seat. Sent to everyone when it changes, and to a new connection right after its table.snapshot.
 */
export interface AudienceUpdatedMessage {
  protocol_version: ProtocolVersion;
  type: "audience.updated";
  room_id: RoomId;
  hand_id: HandIdOrNull;
  version: Version;
  server_time: ServerTime;
  payload: {
    /**
     * @maxItems 200
     */
    spectators: Spectator[];
  };
}
/**
 * Someone connected to the room without a seat.
 */
export interface Spectator {
  player_id: PlayerId;
  display_name: string;
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
 * Command: show the sender's two cards to the whole table after the hand hand_id is over, until the next hand starts. Only for a player dealt into that hand whose cards the table does not see yet. Answered by cards.shown to everyone, or command.rejected (hand_in_progress, stale_hand, not_in_hand, already_shown).
 */
export interface ShowCardsCommandMessage {
  protocol_version: ProtocolVersion;
  type: "command.show_cards";
  room_id: RoomId;
  hand_id: HandId;
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
/**
 * Say something in the room's chat. Not a command: no command_id, no ack; the sender sees their line come back as chat.message. Too fast: protocol.error rate_limited.
 */
export interface ChatSendMessage {
  protocol_version: ProtocolVersion;
  type: "chat.send";
  room_id: RoomId;
  payload: {
    text: ChatText;
  };
}
