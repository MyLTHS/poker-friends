// How strong a new password looks, for the strength bar and the rule list under the field. Only a
// hint: the server's Django validators decide (8+ characters, not all digits, not too common, not
// like the name or email), and their errors show under the field after submitting.

export type PasswordLevel = 1 | 2 | 3 | 4;
export type PasswordRule = { text: string; ok: boolean; optional?: boolean };

export function passwordLevel(password: string): PasswordLevel {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/\p{L}/u.test(password) && /\d/.test(password)) score += 1;
  if (/[^\p{L}\d]/u.test(password) || (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password))) score += 1;
  if (/^\d+$/.test(password)) score = Math.min(score, 1); // the server refuses all-digit passwords
  return Math.max(1, Math.min(4, score)) as PasswordLevel;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { text: "8 ký tự trở lên", ok: password.length >= 8 },
    { text: "Không chỉ toàn chữ số", ok: password.length > 0 && !/^\d+$/.test(password) },
    { text: "Thêm ký tự đặc biệt để mạnh hơn", ok: /[^\p{L}\d]/u.test(password), optional: true },
  ];
}
