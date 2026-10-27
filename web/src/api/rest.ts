// GENERATED from docs/api/openapi.yaml by web/scripts/gen-api-types.mjs. Do not edit by hand:
// change the contract in docs/api/ and run `npm run api:gen` in web/.

export interface paths {
    "/api/rooms/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tạo phòng (dự kiến B7)
         * @description Người gọi thành chủ phòng. Phòng mới ở trạng thái `open`, chưa ai ngồi.
         */
        post: operations["createRoom"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        /** Xem cấu hình phòng (dự kiến B7) */
        get: operations["getRoom"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/seats/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Vào ghế (dự kiến B4)
         * @description Người gọi ngồi vào một ghế trống. Được dealt từ ván kế tiếp nếu có chip trong phòng.
         *     Cả bàn nhận `seat.updated` qua WebSocket.
         */
        post: operations["takeSeat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/seats/me/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Rời ghế (dự kiến B4)
         * @description Không được rời khi còn trong ván đang chạy (`player_in_hand`); hãy sit-out qua WebSocket
         *     rồi rời sau. Chip vẫn thuộc phòng, vào lại vẫn còn. Cả bàn nhận `seat.updated`.
         */
        delete: operations["leaveSeat"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/snapshot/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        /**
         * Lấy trạng thái bàn (dự kiến B4)
         * @description Giống `table.snapshot` của WebSocket, đã che bài theo góc nhìn người gọi. Dùng để vẽ
         *     trang lần đầu trước khi mở WebSocket; sau đó WebSocket là nguồn cập nhật.
         */
        get: operations["getTableSnapshot"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        CreateRoomRequest: {
            name: string;
            /** @default 9 */
            max_seats: number;
            small_blind: number;
            /** @description Phải lớn hơn `small_blind`. */
            big_blind: number;
            /** @default 30 */
            think_time_seconds: number;
            /**
             * @description Thưởng luật 7-2 (#27); 0 là tắt.
             * @default 0
             */
            seven_deuce_bonus: number;
        };
        TakeSeatRequest: {
            seat: components["schemas"]["SeatNumber"];
        };
        /** @description Cùng nội dung với `payload.table` và `version` của `table.snapshot` trên WebSocket. */
        TableSnapshot: {
            version: components["schemas"]["Version"];
            server_time: components["schemas"]["ServerTime"];
            table: components["schemas"]["TableState"];
        };
        ApiError: {
            /**
             * @description Mã ổn định, client được phép `switch` theo mã.
             * @enum {string}
             */
            code: "validation_error" | "not_authenticated" | "forbidden" | "room_not_found" | "room_closed" | "invalid_seat" | "seat_taken" | "already_seated" | "not_seated" | "player_in_hand" | "rate_limited";
            /** @description Để đọc log, không hiện cho người chơi. */
            message: string;
            /** @description Chỉ có khi `validation_error`, lỗi theo từng trường của body. */
            fields?: {
                [key: string]: string[];
            };
        };
        /** RoomId */
        RoomId: number;
        /** Chips */
        Chips: number;
        /** RoomInfo */
        RoomInfo: {
            room_id: components["schemas"]["RoomId"];
            name: string;
            /** @enum {string} */
            status: "open" | "playing" | "closed";
            max_seats: number;
            small_blind: number;
            big_blind: number;
            think_time_seconds: number;
            seven_deuce_bonus: components["schemas"]["Chips"];
        };
        /** SeatNumber */
        SeatNumber: number;
        /**
         * PlayerId
         * @description String form of the user's id (str(User.pk)), the id the engine uses.
         */
        PlayerId: string;
        /**
         * SeatOccupant
         * @description Who sits in a seat. stack is the room balance from the ledger: during a hand it is the balance before that hand; the live stack is in HandView.
         */
        SeatOccupant: {
            seat: components["schemas"]["SeatNumber"];
            player_id: components["schemas"]["PlayerId"];
            display_name: string;
            stack: components["schemas"]["Chips"];
            sitting_out: boolean;
            connected: boolean;
        };
        /**
         * Version
         * @description Room event counter. Every state event adds exactly 1; replies carry the current value.
         */
        Version: number;
        /**
         * ServerTime
         * @description UTC instant in ISO 8601 with a trailing Z, e.g. 2026-10-27T14:03:05.120Z.
         */
        ServerTime: string;
        /**
         * HandId
         * @description Database id of the hand (Hand.pk), not the hand number within the room.
         */
        HandId: number;
        /**
         * VisibleCard
         * @description A face-up card; never ??.
         */
        VisibleCard: string;
        /** Pot */
        Pot: {
            amount: components["schemas"]["Chips"];
            eligible: components["schemas"]["PlayerId"][];
        };
        /**
         * Card
         * @description Rank (2-9, T, J, Q, K, A) then suit (c, d, h, s), e.g. As, 7h. A hidden card is ??.
         */
        Card: string;
        /**
         * HandPlayer
         * @description One player in the hand as the receiver may see them. cards hold ?? for every card the receiver may not see; they are empty once the player folded.
         */
        HandPlayer: {
            player_id: components["schemas"]["PlayerId"];
            seat: components["schemas"]["SeatNumber"];
            stack: components["schemas"]["Chips"];
            bet: components["schemas"]["Chips"];
            in_hand: boolean;
            cards: components["schemas"]["Card"][];
        };
        /**
         * LegalActions
         * @description What the player to act may do, computed by the server (HandEngine.legal_actions).
         */
        LegalActions: {
            can_fold: boolean;
            can_check: boolean;
            call_amount: components["schemas"]["Chips"];
            min_raise_to: number | null;
            max_raise_to: number | null;
        };
        /**
         * HandView
         * @description The hand as one receiver may see it: HandEngine.view_for(receiver) plus hand_id and hand_no. Spectators get view_for(None).
         */
        HandView: {
            hand_id: components["schemas"]["HandId"];
            hand_no: number;
            button_seat: components["schemas"]["SeatNumber"];
            small_blind: number;
            big_blind: number;
            board: components["schemas"]["VisibleCard"][];
            pots: components["schemas"]["Pot"][];
            players: components["schemas"]["HandPlayer"][];
            /** @description The player to act, or null when nobody is (hand complete). */
            actor: components["schemas"]["PlayerId"] | null;
            /** @description Only for the receiver when they are the actor; null for everyone else. */
            legal_actions: components["schemas"]["LegalActions"] | null;
            complete: boolean;
        };
        /**
         * Turn
         * @description Whose turn it is and when the server acts for them (check if free, otherwise fold).
         */
        Turn: {
            player_id: components["schemas"]["PlayerId"];
            seat: components["schemas"]["SeatNumber"];
            deadline: components["schemas"]["ServerTime"];
            think_time_seconds: number;
        };
        /**
         * TableState
         * @description Everything a client needs to draw the table from scratch, projected for one receiver.
         */
        TableState: {
            room: components["schemas"]["RoomInfo"];
            /** @description The receiver. seat is null for a spectator. */
            you: {
                player_id: components["schemas"]["PlayerId"];
                seat: components["schemas"]["SeatNumber"] | null;
            };
            /** @description Occupied seats only, ordered by seat. */
            seats: components["schemas"]["SeatOccupant"][];
            hand: components["schemas"]["HandView"] | null;
            turn: components["schemas"]["Turn"] | null;
        };
    };
    responses: {
        /** @description Body sai (`validation_error`, `invalid_seat`) */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Chưa đăng nhập (`not_authenticated`) */
        Unauthenticated: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Không có phòng hoặc không được xem phòng này (`room_not_found`) */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Trạng thái không cho phép (`seat_taken`, `already_seated`, `not_seated`, `player_in_hand`, `room_closed`) */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Gọi quá nhanh (`rate_limited`) */
        RateLimited: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
    };
    parameters: {
        RoomId: components["schemas"]["RoomId"];
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createRoom: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "name": "Bàn bạn bè",
                 *       "max_seats": 9,
                 *       "small_blind": 5,
                 *       "big_blind": 10,
                 *       "think_time_seconds": 20,
                 *       "seven_deuce_bonus": 50
                 *     }
                 */
                "application/json": components["schemas"]["CreateRoomRequest"];
            };
        };
        responses: {
            /** @description Đã tạo */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomInfo"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            429: components["responses"]["RateLimited"];
        };
    };
    getRoom: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cấu hình phòng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomInfo"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
        };
    };
    takeSeat: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                /**
                 * @example {
                 *       "seat": 3
                 *     }
                 */
                "application/json": components["schemas"]["TakeSeatRequest"];
            };
        };
        responses: {
            /** @description Đã ngồi */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeatOccupant"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    leaveSeat: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Đã rời ghế */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    getTableSnapshot: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trạng thái bàn */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TableSnapshot"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            404: components["responses"]["NotFound"];
        };
    };
}
