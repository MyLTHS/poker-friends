// What the account screens say for each ApiError code (docs/api/openapi.yaml). The server's
// `message` is for logs; players read these.

import type { ClientError } from "./api";

const TEXT: Record<string, string> = {
  validation_error: "Có ô chưa đúng, xem ghi chú dưới từng ô.",
  invalid_credentials: "Sai email hoặc mật khẩu.",
  email_not_verified: "Email này chưa được xác minh. Mở email và bấm vào link, hoặc gửi lại link.",
  email_taken: "Email này đã thuộc một tài khoản khác. Hãy đăng nhập bằng tài khoản đó.",
  username_taken: "Tên này đã có người dùng, chọn tên khác.",
  invalid_token: "Link không dùng được nữa (sai, đã dùng hoặc hết hạn). Hãy xin link mới.",
  not_guest: "Chỉ tài khoản khách mới nâng cấp được.",
  not_authenticated: "Bạn chưa đăng nhập.",
  forbidden: "Phiên đã cũ. Tải lại trang rồi thử lại.",
  network_error: "Không nối được tới server. Kiểm tra Django đang chạy rồi thử lại.",
  social_account_taken: "Tài khoản Google này đã gắn với một người chơi khác.",
  google_disabled: "Server chưa bật đăng nhập Google.",
  google_failed: "Đăng nhập Google không xong (bị huỷ hoặc Google báo lỗi). Thử lại nhé.",
};

export function errorText(error: Pick<ClientError, "code">, retryAfter?: number): string {
  if (error.code === "rate_limited") {
    const minutes = Math.max(1, Math.ceil((retryAfter ?? 60) / 60));
    return `Bạn thử quá nhiều lần. Đợi khoảng ${minutes} phút rồi thử lại.`;
  }
  return TEXT[error.code] ?? "Có lỗi xảy ra, thử lại sau.";
}

export type Notice = { kind: "ok" | "error"; text: string };

/** The Google flow ends on /account?google=ok or /account?error=<code>. */
export function googleResult(params: URLSearchParams): Notice | null {
  if (params.get("google") === "ok") return { kind: "ok", text: "Đã đăng nhập bằng Google." };
  const code = params.get("error");
  if (code) return { kind: "error", text: errorText({ code } as Pick<ClientError, "code">) };
  return null;
}
