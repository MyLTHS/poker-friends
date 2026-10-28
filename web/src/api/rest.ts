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
        /**
         * Lobby
         * @description Phòng chưa đóng mà người gọi được thấy: mọi phòng public, cộng phòng private mà người gọi là
         *     chủ hoặc đã vào bằng link mời. Mới tạo trước. Không cần đăng nhập (chưa đăng nhập thì chỉ
         *     thấy phòng public).
         */
        get: operations["listRooms"];
        put?: never;
        /**
         * Tạo phòng
         * @description Người gọi (kể cả khách) thành chủ phòng. Phòng mới ở trạng thái `open`, chưa ai ngồi, chưa ai
         *     có chip: chủ phòng cấp chip bằng `grantChips` sau khi người chơi vào ghế. Phòng private chỉ
         *     người có link mời (`invite_token`) mới thấy. Giới hạn 10 phòng/giờ mỗi người.
         */
        post: operations["createRoom"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/join/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Vào phòng bằng link mời
         * @description Trang web mở link `FRONTEND_URL/rooms/join?token=...` rồi gọi API này. Người gọi thành thành
         *     viên của phòng (thấy phòng private, vào ghế được). Chưa đăng nhập thì server tạo khách và đăng
         *     nhập luôn, như khi mở bàn. Mã sai hoặc đã bị chủ phòng đổi: `room_not_found`.
         */
        post: operations["joinRoom"];
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
        /**
         * Xem phòng
         * @description Phòng private mà người gọi không có quyền xem thì trả `room_not_found` như phòng không tồn tại.
         */
        get: operations["getRoom"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Chủ phòng đổi cấu hình
         * @description Chỉ chủ phòng (`forbidden` với người khác). Đang có ván thì ván đó giữ cấu hình cũ: thay đổi
         *     nằm trong `pending` và có hiệu lực từ ván sau; cả bàn nhận `room.updated` lúc đó. Không có ván
         *     thì có hiệu lực ngay. `small_blind` phải nhỏ hơn `big_blind` (tính cả giá trị đang có).
         */
        patch: operations["updateRoom"];
        trace?: never;
    };
    "/api/rooms/{room_id}/chips/": {
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
         * Chủ phòng cấp hoặc điều chỉnh chip
         * @description Chỉ chủ phòng. Ghi một bút toán `grant` vào sổ chip của phòng; `amount` âm là trừ bớt (không
         *     được làm số dư âm: `negative_balance`). Người nhận phải đang ngồi ghế (`not_seated`) và không ở
         *     trong ván đang chạy (`player_in_hand`). Cả bàn nhận `seat.updated` với `stack` mới.
         */
        post: operations["grantChips"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/kick/": {
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
         * Chủ phòng mời một người ra khỏi phòng
         * @description Chỉ chủ phòng, không kick được chính mình. Người đó rời ghế (chip vẫn nằm trong sổ của phòng),
         *     mất quyền xem phòng private, mọi kết nối WebSocket của họ bị đóng (mã 4403), và không vào lại
         *     được (`kicked`). Đang trong ván thì từ chối `player_in_hand`: đợi ván xong.
         *     Phòng private: link mời đổi luôn (link cũ hết hiệu lực), để người đó không quay lại bằng một
         *     tài khoản khách mới qua link cũ; chủ phòng gửi link mới cho ai còn cần. Phòng public: chỉ chặn
         *     được tài khoản đó, không chặn được người đó mở một tài khoản khách mới (không chặn theo IP).
         */
        post: operations["kickPlayer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/close/": {
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
         * Chủ phòng đóng phòng
         * @description Chỉ chủ phòng. Không có ván thì đóng ngay (200). Đang có ván thì đóng khi ván xong (202,
         *     `closing: true`). Phòng đóng: không chia ván mới, không vào ghế được, biến khỏi lobby; sổ chip
         *     và lịch sử giữ nguyên. Cả bàn nhận `room.updated` với `status: "closed"`.
         */
        post: operations["closeRoom"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/invite/": {
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
         * Chủ phòng đổi link mời
         * @description Tạo `invite_token` mới; link cũ hết hiệu lực ngay (người đã vào phòng vẫn giữ quyền).
         */
        post: operations["rotateInvite"];
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
         *     Cả bàn nhận `seat.updated` qua WebSocket. Phòng private cần quyền xem (`room_not_found`);
         *     người đã bị kick nhận `kicked`; phòng đã đóng nhận `room_closed`; phòng tạm dừng nhận
         *     `room_suspended`. Chưa đăng nhập thì server tạo khách và đăng nhập luôn (tối đa 20 khách/giờ
         *     mỗi IP, quá thì `rate_limited`); điều này đúng cho mọi API của bàn và cho WebSocket.
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
         *     Cũng dùng cho thư mời của tài khoản quản trị viên tạo trong admin (link có thêm `moi=1`):
         *     token mời sống 7 ngày thay vì 1 giờ, và cũng chỉ dùng được một lần.
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
    "/api/rooms/{room_id}/chat/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        /**
         * 50 dòng chat gần nhất
         * @description Cũ trước, mới sau. Dòng mới tới qua WebSocket `chat.message`. Cần quyền xem phòng như `getRoom` (`room_not_found` nếu không, `kicked` nếu đã bị kick).
         */
        get: operations["getChatHistory"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/hands/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        /**
         * Lịch sử ván của phòng
         * @description 100 ván đã xong gần nhất, mới trước. Ván đang chơi không có ở đây. Ván bị người quản trị huỷ
         *     (`void_hand`) có `voided: true` và không ai có lời/lỗ. Cần quyền xem phòng như `getRoom` (`room_not_found` nếu không, `kicked` nếu đã bị kick).
         */
        get: operations["listHands"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/rooms/{room_id}/summary/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                room_id: components["parameters"]["RoomId"];
            };
            cookie?: never;
        };
        /**
         * Bảng tổng kết lời/lỗ
         * @description Mỗi người từng có chip trong phòng: đã được cấp bao nhiêu, thắng/thua bao nhiêu ở các ván,
         *     thưởng 7-2 nhận/trả, số dư hiện tại và lời/lỗ (`net` = số dư − đã cấp). Tính từ sổ chip;
         *     tổng `net` của cả phòng luôn bằng 0. Cần quyền xem phòng như `getRoom` (`room_not_found` nếu không, `kicked` nếu đã bị kick).
         */
        get: operations["getRoomSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/hands/{hand_id}/replay/": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                hand_id: number;
            };
            cookie?: never;
        };
        /**
         * Xem lại một ván từng bước
         * @description Dựng lại ván từ cấu hình và các lệnh đã lưu. Mỗi bước là `HandView` **theo góc nhìn người
         *     gọi tại thời điểm đó**: chỉ thấy bài của chính mình (nếu đã ngồi ván đó) và bài đã lật tới
         *     bước đó; bài úp của người khác luôn là `"??"`. Chỉ ván đã xong (`hand_not_found` cho ván đang
         *     chơi hoặc không có quyền xem); ván đã huỷ: `hand_voided`. `legal_actions` luôn `null`.
         */
        get: operations["getHandReplay"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/feedback/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Gửi phản hồi (lỗi, ý tưởng, khác)
         * @description Phải đăng nhập, khách cũng được. Tối đa 10 lần mỗi giờ mỗi người. `room_id` là phòng đang
         *     chơi (nếu có); phòng không có hoặc không được xem đều báo `validation_error` ở `room_id`.
         *     Server tự ghi trình duyệt (`User-Agent`); token trong `page` và `message` (link mời, link
         *     đặt lại mật khẩu dán vào) bị xoá trước khi lưu. Không có endpoint đọc lại.
         */
        post: operations["sendFeedback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/client-errors/": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Báo một lỗi JavaScript của trình duyệt
         * @description Không cần đăng nhập. Tối đa 30 lần/10 phút mỗi người (nếu đã đăng nhập, kiểm trước) và 60
         *     lần/10 phút mỗi IP; cả server nhận tối đa 1000 lỗi **mới** mỗi 24 giờ. Quá các mức này đều
         *     trả `rate_limited` (429) với `Retry-After`. Trường dài hơn giới hạn bị cắt bớt, không bị
         *     từ chối. Cùng `message`, `page` và `release` trong cùng khung 10 phút cố định (10:00–10:10…)
         *     chỉ tăng bộ đếm, không lưu thêm dòng, kể cả khi hai báo cáo tới cùng lúc. Trước khi lưu,
         *     server xoá cookie, header `Cookie` / `X-CSRFToken`, `sessionid`, `csrftoken`, token trong
         *     link hay trong JSON (`"invite_token": …`) và danh sách lá bài khỏi mọi trường; client cũng
         *     không được gửi chúng. Không có endpoint đọc lại.
         */
        post: operations["reportClientError"];
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
        FeedbackRequest: {
            /** @enum {string} */
            kind: "bug" | "idea" | "other";
            /** @description Bỏ khoảng trắng hai đầu rồi tính độ dài; toàn khoảng trắng là thiếu. */
            message: string;
            /** @description Đường dẫn trang lúc gửi, ví dụ `/rooms/3/table`. */
            page?: string;
            room_id?: number | null;
        };
        FeedbackCreated: {
            feedback_id: number;
        };
        /** @description Trường nào dài hơn giới hạn thì server cắt bớt. */
        ClientErrorReport: {
            /** @description Server giữ tối đa 1000 ký tự. */
            message: string;
            /** @description Server giữ tối đa 8000 ký tự. */
            stack?: string;
            /** @description Server giữ tối đa 500 ký tự. */
            page?: string;
            /** @description Trống thì server lấy header `User-Agent`. Tối đa 500 ký tự. */
            user_agent?: string;
            /** @description Phiên bản web đang chạy. Tối đa 64 ký tự. */
            release?: string;
        };
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
            /**
             * @description Phòng private không hiện ở lobby; chỉ chủ phòng và người có link mời thấy.
             * @default false
             */
            is_private?: boolean;
        };
        Lobby: {
            rooms: components["schemas"]["LobbyRoom"][];
        };
        LobbyRoom: {
            room: components["schemas"]["RoomInfo"];
            is_private: boolean;
            owner_name: string | null;
            /** @description Số ghế đang có người. */
            seated: number;
        };
        RoomDetail: {
            room: components["schemas"]["RoomInfo"];
            is_private: boolean;
            /** @description Cùng dạng `player_id` ở WebSocket. */
            owner_id: string | null;
            owner_name: string | null;
            /** @description Người gọi có phải chủ phòng không. */
            is_owner: boolean;
            /** @description Chỉ chủ phòng thấy; người khác nhận `null`. Link mời là `FRONTEND_URL/rooms/join?token=<invite_token>`. */
            invite_token: string | null;
            /** @description Cấu hình chủ phòng đã đổi nhưng chờ ván sau; `null` nếu không có. */
            pending: components["schemas"]["UpdateRoomRequest"] | null;
            /** @description Chủ phòng đã đóng phòng, chờ ván đang chạy xong. */
            closing: boolean;
        };
        UpdateRoomRequest: {
            name?: string;
            small_blind?: number;
            big_blind?: number;
            think_time_seconds?: number;
            seven_deuce_bonus?: number;
        };
        JoinRoomRequest: {
            invite_token: string;
        };
        GrantChipsRequest: {
            player_id: components["schemas"]["PlayerId"];
            /** @description Dương là cấp thêm, âm là trừ bớt. */
            amount: number;
        };
        GrantChipsResult: {
            player_id: components["schemas"]["PlayerId"];
            amount: number;
            balance: components["schemas"]["Chips"];
        };
        PlayerRequest: {
            player_id: components["schemas"]["PlayerId"];
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
            /**
             * @description `false` (chơi từ máy nhà, production): chỉ thành viên mới vào được: tài khoản thật đã
             *     xác minh email **và được chủ phòng duyệt** (`User.approved`), hoặc staff.
             *     Ẩn nút khách. Mọi API ngoài `/api/auth/`: 401 `login_required` cho người chưa đăng
             *     nhập hay phiên khách cũ, 403 `not_approved` cho tài khoản chưa được duyệt. Đăng nhập
             *     tài khoản chưa được duyệt cũng trả `not_approved`. WebSocket đóng với mã 4401.
             */
            guests_allowed: boolean;
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
            /**
             * @description Vào được các phòng. Luôn `true` khi server cho khách; khi chỉ cho thành viên
             *     (`guests_allowed: false`): `true` với tài khoản đã được chủ phòng duyệt (hoặc staff),
             *     `false` thì hiện "đợi chủ phòng duyệt".
             */
            member: boolean;
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
        ChatHistory: {
            messages: components["schemas"]["ChatMessage"][];
        };
        HandList: {
            hands: components["schemas"]["HandSummary"][];
        };
        HandSummary: {
            hand_id: number;
            hand_no: number;
            completed_at: components["schemas"]["ServerTime"];
            voided: boolean;
            players: {
                player_id: components["schemas"]["PlayerId"];
                display_name: string;
                /** @description `null` với người không được chia bài mà vẫn có bút toán (đang nghỉ nhưng phải trả thưởng 7-2). */
                seat: components["schemas"]["SeatNumber"] | null;
                /** @description Lời (+) / lỗ (−) của ván, gồm cả thưởng 7-2. Tổng cả ván bằng 0. */
                net: number;
            }[];
        };
        HandReplay: {
            hand_id: number;
            hand_no: number;
            room_id: components["schemas"]["RoomId"];
            completed_at: components["schemas"]["ServerTime"];
            /** @description Bước đầu là lúc vừa chia bài (`action` null); mỗi bước sau là một hành động đã áp. */
            steps: {
                action: components["schemas"]["AppliedAction"] | null;
                hand: components["schemas"]["HandView"];
            }[];
            /**
             * @description Mọi người có bút toán trong ván này, kể cả người đang nghỉ (sit-out) mà phải trả thưởng
             *     7-2. Tổng `hand_net + seven_deuce_net` của cả ván luôn bằng 0.
             */
            results: {
                player_id: components["schemas"]["PlayerId"];
                display_name: string;
                hand_net: number;
                seven_deuce_net: number;
            }[];
            /** @description Người ăn thưởng luật 7-2 ở ván này (#27), `null` nếu không có. */
            seven_deuce_winner: components["schemas"]["PlayerId"] | null;
            /**
             * @description Bộ bài của từng người còn ngửa bài sau showdown (như `hand.completed.payload.showdown`),
             *     theo số ghế; `[]` nếu ván kết thúc vì mọi người bỏ bài (kể cả khi lật 7-2).
             */
            showdown: components["schemas"]["ShowdownHand"][];
            /** @description Ván xong (không bị huỷ) ngay trước ván này trong phòng, theo số ván; `null` nếu không có. Không giới hạn trong 100 ván của danh sách. */
            prev_hand: components["schemas"]["HandLink"] | null;
            /** @description Ván xong (không bị huỷ) ngay sau ván này; `null` nếu không có. */
            next_hand: components["schemas"]["HandLink"] | null;
        };
        HandLink: {
            hand_id: number;
            hand_no: number;
        };
        RoomSummary: {
            players: {
                player_id: components["schemas"]["PlayerId"];
                display_name: string;
                /** @description Tổng chip chủ phòng đã cấp (trừ đi phần đã trừ bớt). */
                granted: number;
                /** @description Thắng (+) / thua (−) ở các ván. */
                hands_net: number;
                seven_deuce_net: number;
                balance: components["schemas"]["Chips"];
                /** @description Lời/lỗ = balance − granted = hands_net + seven_deuce_net. */
                net: number;
                hands_played: number;
            }[];
        };
        ApiError: {
            /**
             * @description Mã ổn định, client được phép `switch` theo mã.
             * @enum {string}
             */
            code: "validation_error" | "not_authenticated" | "login_required" | "guests_disabled" | "not_approved" | "forbidden" | "room_not_found" | "room_closed" | "invalid_seat" | "seat_taken" | "already_seated" | "not_seated" | "player_in_hand" | "rate_limited" | "invalid_credentials" | "email_not_verified" | "email_taken" | "username_taken" | "invalid_token" | "not_guest" | "method_not_allowed" | "invalid_amount" | "negative_balance" | "kicked" | "hand_not_found" | "hand_voided" | "room_suspended";
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
        /**
         * PlayerId
         * @description String form of the user's id (str(User.pk)), the id the engine uses.
         */
        PlayerId: string;
        /** SeatNumber */
        SeatNumber: number;
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
        /**
         * ChatText
         * @description 1 to 300 characters; not blank.
         */
        ChatText: string;
        /**
         * ChatMessage
         * @description One chat line in a room (B8). Emoji are ordinary characters in text.
         */
        ChatMessage: {
            message_id: number;
            player_id: components["schemas"]["PlayerId"];
            display_name: string;
            text: components["schemas"]["ChatText"];
            sent_at: components["schemas"]["ServerTime"];
        };
        /**
         * AppliedAction
         * @description One applied action. Like command.act: fold, check and call have no amount; raise has the total raised to. timeout is true when the server acted because the clock ran out.
         */
        AppliedAction: {
            player_id: components["schemas"]["PlayerId"];
            seat: components["schemas"]["SeatNumber"];
            /** @enum {string} */
            kind: "fold" | "check" | "call";
            amount: null;
            timeout: boolean;
        } | {
            player_id: components["schemas"]["PlayerId"];
            seat: components["schemas"]["SeatNumber"];
            /** @constant */
            kind: "raise";
            amount: number;
            timeout: boolean;
        };
        /**
         * HandCategory
         * @description A made poker hand, from PokerKit's hand labels. Stable codes: the client shows its own words for them.
         * @enum {string}
         */
        HandCategory: "high_card" | "one_pair" | "two_pair" | "three_of_a_kind" | "straight" | "flush" | "full_house" | "four_of_a_kind" | "straight_flush";
        /**
         * ShowdownHand
         * @description The made hand of one player whose cards are face up at the end of a showdown. Never for a player who folded or mucked, nor for a win by folds (a revealed 7-2 bluff included). cards are the best five, from the player's two cards and the board, most significant first (bigger groups, then higher ranks; the ace of a five-high straight last).
         */
        ShowdownHand: {
            player_id: components["schemas"]["PlayerId"];
            seat: components["schemas"]["SeatNumber"];
            category: components["schemas"]["HandCategory"];
            cards: components["schemas"]["VisibleCard"][];
        };
    };
    responses: {
        /** @description Body sai (`validation_error`, `invalid_seat`, `invalid_credentials`, `invalid_token`, `invalid_amount`) */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Chưa đăng nhập (`not_authenticated`), hoặc server chỉ cho thành viên mà người gửi chưa phải thành viên đã xác minh (`login_required`) */
        Unauthenticated: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Thiếu/sai CSRF token hoặc không phải chủ phòng (`forbidden`), email chưa xác minh (`email_not_verified`), đã bị chủ phòng kick (`kicked`), server tắt chế độ khách (`guests_disabled`), tài khoản chưa được chủ phòng duyệt (`not_approved`, cả khi đăng nhập lẫn khi gọi API phòng) */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Không có phòng hoặc không được xem phòng này (`room_not_found`); không có ván, ván chưa xong hoặc không được xem (`hand_not_found`) */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ApiError"];
            };
        };
        /** @description Trạng thái không cho phép (`seat_taken`, `already_seated`, `not_seated`, `player_in_hand`, `room_closed`, `email_taken`, `username_taken`, `not_guest`, `negative_balance`, `hand_voided`, `room_suspended`) */
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
    listRooms: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Danh sách phòng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Lobby"];
                };
            };
        };
    };
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
                 *       "seven_deuce_bonus": 50,
                 *       "is_private": true
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
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
        };
    };
    joinRoom: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["JoinRoomRequest"];
            };
        };
        responses: {
            /** @description Đã vào phòng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            400: components["responses"]["BadRequest"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
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
            /** @description Phòng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    updateRoom: {
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
                 *       "small_blind": 10,
                 *       "big_blind": 20
                 *     }
                 */
                "application/json": components["schemas"]["UpdateRoomRequest"];
            };
        };
        responses: {
            /** @description Đã nhận; xem `room` (đang áp dụng) và `pending` (chờ ván sau) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    grantChips: {
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
                 *       "player_id": "7",
                 *       "amount": 1000
                 *     }
                 */
                "application/json": components["schemas"]["GrantChipsRequest"];
            };
        };
        responses: {
            /** @description Đã ghi sổ */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GrantChipsResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    kickPlayer: {
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
                "application/json": components["schemas"]["PlayerRequest"];
            };
        };
        responses: {
            /** @description Đã kick */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    closeRoom: {
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
            /** @description Đã đóng */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            /** @description Sẽ đóng khi ván đang chạy xong */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    rotateInvite: {
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
            /** @description Link mới */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomDetail"];
                };
            };
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
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
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
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
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            429: components["responses"]["RateLimited"];
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
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["RateLimited"];
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
    getChatHistory: {
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
            /** @description Chat */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatHistory"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    listHands: {
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
            /** @description Các ván */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HandList"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    getRoomSummary: {
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
            /** @description Bảng tổng kết */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoomSummary"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
        };
    };
    getHandReplay: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                hand_id: number;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Các bước */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HandReplay"];
                };
            };
            403: components["responses"]["Forbidden"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    sendFeedback: {
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
                 *       "kind": "bug",
                 *       "message": "Bấm Theo hai lần mới ăn.",
                 *       "page": "/rooms/3/table",
                 *       "room_id": 3
                 *     }
                 */
                "application/json": components["schemas"]["FeedbackRequest"];
            };
        };
        responses: {
            /** @description Đã nhận */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FeedbackCreated"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthenticated"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
        };
    };
    reportClientError: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClientErrorReport"];
            };
        };
        responses: {
            /** @description Đã nhận (hoặc đã cộng vào lỗi giống hệt trong cùng khung 10 phút) */
            204: {
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
}
