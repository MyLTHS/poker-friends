// What the account screens say for each ApiError code (docs/api/openapi.yaml). The server's
// `message` is for logs; players read these.

import type { components } from "@/api/rest";

import type { ClientError } from "./api";

export type GoogleError = components["schemas"]["GoogleError"];

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
  method_not_allowed: "Trang web gọi sai API. Báo lại cho người làm web nhé.",
  room_not_found: "Không có phòng này, hoặc đây là phòng riêng mà bạn chưa có link mời.",
  room_closed: "Phòng đã đóng.",
  kicked: "Chủ phòng đã mời bạn ra khỏi phòng này.",
  player_in_hand: "Người này đang trong ván. Đợi ván xong rồi làm lại.",
  not_seated: "Người này không ngồi ở bàn.",
  negative_balance: "Không trừ được nhiều hơn số chip người đó đang có.",
  invalid_amount: "Số chip phải khác 0.",
  seat_taken: "Ghế này có người rồi.",
  already_seated: "Bạn đang ngồi một ghế khác rồi.",
  invalid_seat: "Ghế không hợp lệ.",
  network_error: "Không nối được tới server. Kiểm tra Django đang chạy rồi thử lại.",
  // members only (server GUESTS_ALLOWED off, account/members.ts)
  login_required: "Bàn này chỉ dành cho thành viên. Đăng nhập để vào.",
  guests_disabled: "Chỉ thành viên: đăng ký tài khoản là vào chơi được.",
};

// The Google flow ends on /account?error=<GoogleError>; worded for someone who just used Google.
const GOOGLE_TEXT: Record<GoogleError, string> = {
  google_disabled: "Server chưa bật đăng nhập Google.",
  google_failed: "Đăng nhập Google không xong (bị huỷ hoặc Google báo lỗi). Thử lại nhé.",
  email_taken: "Email của tài khoản Google này đã thuộc một tài khoản khác. Đăng nhập bằng tài khoản đó.",
  email_not_verified: "Google chưa xác minh email của tài khoản Google này, nên không dùng được để đăng nhập.",
  social_account_taken: "Tài khoản Google này đã gắn với một người chơi khác.",
  not_guest: "Chỉ tài khoản khách mới nâng cấp bằng Google được.",
  account_inactive: "Tài khoản này đã bị khoá. Hỏi chủ câu lạc bộ nhé.",
};

export function errorText(error: Pick<ClientError, "code">, retryAfter?: number): string {
  if (error.code === "rate_limited") {
    const minutes = Math.max(1, Math.ceil((retryAfter ?? 60) / 60));
    return `Bạn thử quá nhiều lần. Đợi khoảng ${minutes} phút rồi thử lại.`;
  }
  return TEXT[error.code] ?? "Có lỗi xảy ra, thử lại sau.";
}

/** The ApiError codes that are about one box of the form: the answer goes under that box. */
export const FIELD_OF_CODE: Record<string, string> = { email_taken: "email", username_taken: "username" };

type Checked = Pick<HTMLInputElement, "validity" | "type" | "minLength" | "maxLength" | "title" | "validationMessage">;

/** What the browser's own checks (required, type=email, minLength…) found, in Vietnamese: the
 *  browser would say it in its own language, in a bubble outside the page. */
export function invalidText(input: Checked): string {
  const { validity } = input;
  if (validity.valueMissing) return "Chưa điền ô này.";
  if (validity.typeMismatch && input.type === "email") return "Email chưa đúng dạng, ví dụ ten@gmail.com.";
  if (validity.tooShort) return `Cần ít nhất ${input.minLength} ký tự.`;
  if (validity.tooLong) return `Tối đa ${input.maxLength} ký tự.`;
  if (validity.patternMismatch && input.title) return input.title; // the box's own rule, e.g. the name's
  return input.validationMessage; // setCustomValidity's text, or the browser's
}

export type Notice = { kind: "ok" | "error"; text: string };

/** The Google flow ends on /account?google=ok or /account?error=<code>. */
export function googleResult(params: URLSearchParams): Notice | null {
  if (params.get("google") === "ok") return { kind: "ok", text: "Đã đăng nhập bằng Google." };
  const code = params.get("error");
  if (!code) return null;
  const text = GOOGLE_TEXT[code as GoogleError] ?? "Đăng nhập Google không xong. Thử lại nhé.";
  return { kind: "error", text };
}
