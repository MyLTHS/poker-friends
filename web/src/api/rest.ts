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
    "/api/auth/config/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Cấu hình màn đăng nhập
         * @description Cho biết có bật Google không, và đặt cookie `csrftoken`. Gọi đầu tiên khi mở trang.
         */
        get: operations["getAuthConfig"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Người đang đăng nhập */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/signup/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Đăng ký bằng email và mật khẩu
         * @description Tạo tài khoản chưa xác minh và gửi email có link xác minh
         *     (`FRONTEND_URL/account/verify?token=...`). **Không** đăng nhập luôn: phải xác minh email
         *     trước. Khách muốn giữ chip thì dùng `upgrade`, không dùng `signup`. Server mail lỗi thì
         *     vẫn trả 201 (đã tạo tài khoản); người dùng xin gửi lại link bằng `resend`.
         */
        post: operations["signup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/verify-email/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Xác minh email bằng token trong link
         * @description Token hết hạn sau 3 ngày, và không dùng được nữa khi email của tài khoản đã đổi.
         */
        post: operations["verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/verify-email/resend/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Gửi lại link xác minh
         * @description Luôn trả 202, có tài khoản chưa xác minh với email đó hay không.
         */
        post: operations["resendVerificationEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Đăng nhập bằng email và mật khẩu
         * @description Sai email hay sai mật khẩu đều trả `invalid_credentials`. Email chưa xác minh:
         *     `email_not_verified` (403). Giới hạn: 20 lần/10 phút mỗi IP; 5 lần sai/15 phút cho một
         *     email từ một IP; 30 lần sai/giờ cho một email từ mọi IP. Quá thì `rate_limited`, kể cả khi
         *     mật khẩu đúng.
         */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Đăng xuất
         * @description Khách đăng xuất là mất tài khoản khách (không có cách đăng nhập lại).
         */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/password/forgot/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Quên mật khẩu — gửi link đặt lại
         * @description Luôn trả 202, có tài khoản hay không. Link `FRONTEND_URL/account/reset?uid=...&token=...`
         *     dùng một lần, hết hạn sau 1 giờ. Giới hạn: 5 lần/giờ mỗi IP, 3 lần/giờ mỗi email.
         */
        post: operations["forgotPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/password/reset/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Đặt mật khẩu mới bằng link trong email
         * @description Thành công thì email của tài khoản cũng được coi là đã xác minh. Không tự đăng nhập.
         */
        post: operations["resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/guest/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Chơi ngay bằng tài khoản khách
         * @description Tạo `User` với `is_guest=true` và đăng nhập luôn. Không đặt tên thì tên là `khach-xxxxxx`.
         *     Đang có phiên rồi thì trả 200 với chính tài khoản đó, không tạo thêm. Giới hạn 20 khách/giờ
         *     mỗi IP.
         */
        post: operations["createGuest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/upgrade/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Nâng cấp khách lên tài khoản email/mật khẩu
         * @description Gắn email + mật khẩu vào **chính** `User` khách đang đăng nhập (giữ nguyên `id`), nên chip
         *     và lịch sử ván ở mọi phòng giữ nguyên. Vẫn đăng nhập sau khi nâng cấp; email gửi link xác
         *     minh như `signup`. Email đã thuộc tài khoản khác: `email_taken`, không gộp tài khoản.
         *     Không phải khách: `not_guest`. Nâng cấp bằng Google: xem `/accounts/google/login/`.
         */
        post: operations["upgradeGuest"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/accounts/google/login/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Bắt đầu đăng nhập (hoặc nâng cấp khách) bằng Google
         * @description **Form của trình duyệt, không phải fetch**: trang web submit một `<form method="post">`
         *     (có `csrfmiddlewaretoken`), server chuyển trình duyệt sang Google rồi Google chuyển về
         *     `/accounts/google/login/callback/`. Cuối cùng trình duyệt về `FRONTEND_URL/account` với
         *     `?google=ok` (đã đăng nhập, tài khoản mới hoặc cũ, hoặc khách đã nâng cấp) hoặc
         *     `?error=<GoogleError>`. Mở thẳng URL này bằng GET thì chỉ quay về `FRONTEND_URL/account`.
         *     Chỉ nhận email Google đánh dấu đã xác minh.
         *
         *     `process=connect` khi khách đang đăng nhập muốn nâng cấp: Google được gắn vào chính `User`
         *     khách (giữ `id`, chip, lịch sử), email Google coi như đã xác minh.
         */
        post: operations["startGoogleLogin"];
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
            max_seats?: number;
            small_blind: number;
            /** @description Phải lớn hơn `small_blind`. */
            big_blind: number;
            /** @default 30 */
            think_time_seconds?: number;
            /**
             * @description Thưởng luật 7-2 (#27); 0 là tắt.
             * @default 0
             */
            seven_deuce_bonus?: number;
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
        AuthConfig: {
            /** @description `false` khi server chưa có `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`: ẩn nút Google. */
            google_enabled: boolean;
        };
        Me: {
            /** @description Không đổi khi khách nâng cấp. */
            id: number;
            /** @description Tên hiện ở bàn chơi. */
            username: string;
            /**
             * Format: email
             * @description `null` với khách.
             */
            email: string | null;
            is_guest: boolean;
            email_verified: boolean;
            /** @description `false` với khách và người chỉ đăng nhập bằng Google. */
            has_password: boolean;
            google_connected: boolean;
        };
        /** @description Chữ (kể cả tiếng Việt), số và `@ . + - _`, không có dấu cách. Không phân biệt hoa thường khi so trùng. */
        Username: string;
        /** @description Theo bộ kiểm tra mật khẩu của Django (tối thiểu 8 ký tự, không quá phổ biến, không toàn số, không giống tên/email). */
        Password: string;
        SignupRequest: {
            /** Format: email */
            email: string;
            username: components["schemas"]["Username"];
            password: components["schemas"]["Password"];
        };
        LoginRequest: {
            /** Format: email */
            email: string;
            password: string;
        };
        EmailRequest: {
            /** Format: email */
            email: string;
        };
        TokenRequest: {
            /** @description Tham số `token` của link trong email. */
            token: string;
        };
        ResetPasswordRequest: {
            /** @description Tham số `uid` của link trong email. */
            uid: string;
            /** @description Tham số `token` của link trong email. */
            token: string;
            password: components["schemas"]["Password"];
        };
        GuestRequest: {
            username?: components["schemas"]["Username"];
        };
        UpgradeRequest: {
            /** Format: email */
            email: string;
            password: components["schemas"]["Password"];
            username?: components["schemas"]["Username"];
        };
        GoogleLoginForm: {
            /**
             * @description `connect` để khách đang đăng nhập nâng cấp bằng Google.
             * @default login
             * @enum {string}
             */
            process?: "login" | "connect";
            /** @description Giá trị cookie `csrftoken`. */
            csrfmiddlewaretoken: string;
        };
        /**
         * @description Mã trong `FRONTEND_URL/account?error=<mã>` khi luồng Google không xong.
         *
         *     - `google_disabled` — server chưa có key Google.
         *     - `google_failed` — người dùng huỷ ở Google, Google báo lỗi, hoặc form sai `process`.
         *     - `email_taken` — email Google đã thuộc một tài khoản khác (không gộp tài khoản).
         *     - `email_not_verified` — Google chưa xác minh email của tài khoản Google đó.
         *     - `social_account_taken` — (nâng cấp) tài khoản Google này đã gắn với người khác.
         *     - `not_guest` — (nâng cấp) người đang đăng nhập không phải khách.
         *     - `account_inactive` — tài khoản đã bị admin khoá.
         * @enum {string}
         */
        GoogleError: "google_disabled" | "google_failed" | "email_taken" | "email_not_verified" | "social_account_taken" | "not_guest" | "account_inactive";
        ApiError: {
            /**
             * @description Mã ổn định, client được phép `switch` theo mã.
             * @enum {string}
             */
            code: "validation_error" | "not_authenticated" | "forbidden" | "room_not_found" | "room_closed" | "invalid_seat" | "seat_taken" | "already_seated" | "not_seated" | "player_in_hand" | "rate_limited" | "invalid_credentials" | "email_not_verified" | "email_taken" | "username_taken" | "invalid_token" | "not_guest" | "method_not_allowed";
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
            status: "open" | "playing" | "suspended" | "closed";
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
        /** @description Body sai (`validation_error`, `invalid_seat`, `invalid_credentials`, `invalid_token`) */
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
        /** @description Thiếu/sai CSRF token (`forbidden`), hoặc email chưa xác minh (`email_not_verified`) */
        Forbidden: {
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
        /** @description Trạng thái không cho phép (`seat_taken`, `already_seated`, `not_seated`, `player_in_hand`, `room_closed`, `email_taken`, `username_taken`, `not_guest`) */
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
    getAuthConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cấu hình */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthConfig"];
                };
            };
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Tài khoản của phiên này */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            401: components["responses"]["Unauthenticated"];
        };
    };
    signup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignupRequest"];
            };
        };
        responses: {
            /** @description Đã tạo, đã gửi email xác minh */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
        };
    };
    verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TokenRequest"];
            };
        };
        responses: {
            /** @description Đã xác minh */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
        };
    };
    resendVerificationEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailRequest"];
            };
        };
        responses: {
            /** @description Đã nhận */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
        };
    };
    login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Đã đăng nhập, cookie `sessionid` mới */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Đã đăng xuất */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            403: components["responses"]["Forbidden"];
        };
    };
    forgotPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EmailRequest"];
            };
        };
        responses: {
            /** @description Đã nhận */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
        };
    };
    resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResetPasswordRequest"];
            };
        };
        responses: {
            /** @description Đã đổi mật khẩu */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
        };
    };
    createGuest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["GuestRequest"];
            };
        };
        responses: {
            /** @description Đã có phiên, trả tài khoản hiện tại */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            /** @description Đã tạo khách và đăng nhập */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
        };
    };
    upgradeGuest: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpgradeRequest"];
            };
        };
        responses: {
            /** @description Đã nâng cấp */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
        };
    };
    startGoogleLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": components["schemas"]["GoogleLoginForm"];
            };
        };
        responses: {
            /** @description Chuyển sang Google, hoặc về trang web với `?error=google_disabled` */
            302: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
