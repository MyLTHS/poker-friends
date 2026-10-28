// How strong a new password looks, for the strength bar and the rule list under the field. Only a
// hint: the server's Django validators decide (8+ characters, not all digits, not too common, not
// like the name or email), and their errors show under the field after submitting. The likeness
// check is Django's own; "common" can only be guessed here (Django's list has 20,000 entries), on
// the strict side ("P@ssw0rd!" passes Django but is the first thing anyone tries), and the bar
// never says "Rất mạnh" unless it could check the name and the email.

export type PasswordLevel = 1 | 2 | 3 | 4;
export type PasswordRule = { text: string; ok: boolean; optional?: boolean };
/** What the account will hold: the server compares the password with these. */
export type PasswordContext = { username?: string; email?: string };

// The bases that top every leaked-password list, and their Vietnamese cousins.
const COMMON = new Set([
  "password", "passwd", "matkhau", "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "qazwsx",
  "iloveyou", "anhyeuem", "emyeuanh", "yeuem", "admin", "welcome", "letmein", "monkey", "dragon",
  "football", "baseball", "sunshine", "princess", "master", "superman", "batman", "shadow", "trustno",
  "hello", "secret", "login", "starwars", "freedom", "whatever", "poker", "pokerfriends", "vietnam",
]);
const RUNS = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", $: "s" };

const isRun = (s: string) => s.length >= 4 && RUNS.some((run) => run.includes(s) || [...run].reverse().join("").includes(s));

/** A well-known password, maybe with digits or symbols around it and letters swapped for look-alikes
 *  ("P@ssw0rd!"), or a run or repeat ("abcdefgh", "12345678", "aaaaaaaa"). */
export function looksCommon(password: string): boolean {
  const lower = password.toLowerCase();
  const base = lower.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").replace(/[0134@$5]/g, (c) => LEET[c]);
  return COMMON.has(lower) || COMMON.has(base) || isRun(lower) || isRun(base) || /^(.)\1+$/u.test(lower);
}

/** Python's SequenceMatcher.quick_ratio: shared characters, in any order. */
function quickRatio(a: string, b: string): number {
  const left = new Map<string, number>();
  for (const ch of b) left.set(ch, (left.get(ch) ?? 0) + 1);
  let matches = 0;
  for (const ch of a) {
    const n = left.get(ch) ?? 0;
    if (n > 0) {
      matches += 1;
      left.set(ch, n - 1);
    }
  }
  const total = [...a].length + [...b].length;
  return total ? (2 * matches) / total : 1;
}

/** Django's UserAttributeSimilarityValidator (max_similarity 0.7) on the name and the email, whole
 *  and split into words. */
export function similarTo(password: string, { username, email }: PasswordContext): boolean {
  const pw = password.toLowerCase();
  const length = [...pw].length;
  for (const value of [username, email]) {
    if (!value) continue;
    const lower = value.toLowerCase();
    for (const part of [...lower.split(/[^\p{L}\p{N}_]+/u), lower]) {
      const partLength = [...part].length;
      if (!part || (length >= 10 * partLength && partLength < 0.35 * length)) continue; // Django skips these
      if (quickRatio(pw, part) >= 0.7) return true;
    }
  }
  return false;
}

export function passwordLevel(password: string, context?: PasswordContext): PasswordLevel {
  const known = Boolean(context?.username || context?.email);
  if (looksCommon(password) || (context && similarTo(password, context))) return 1; // the server refuses it
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/\p{L}/u.test(password) && /\d/.test(password)) score += 1;
  if (/[^\p{L}\d]/u.test(password) || (/\p{Ll}/u.test(password) && /\p{Lu}/u.test(password))) score += 1;
  if (/^\d+$/.test(password)) score = Math.min(score, 1); // the server refuses all-digit passwords
  return Math.max(1, Math.min(known ? 4 : 3, score)) as PasswordLevel;
}

/** Why the server will refuse this password, in a few words for the strength bar's label where
 *  there is no rule list (upgrade, reset); null when it looks acceptable. */
export function passwordProblem(password: string, context: PasswordContext = {}): string | null {
  if (password.length < 8) return "cần 8 ký tự trở lên";
  if (/^\d+$/.test(password)) return "không được chỉ toàn chữ số";
  if (looksCommon(password)) return "quá phổ biến, dễ đoán";
  if (similarTo(password, context)) return "giống tên hoặc email";
  return null;
}

export function passwordRules(password: string, context: PasswordContext = {}): PasswordRule[] {
  return [
    { text: "8 ký tự trở lên", ok: password.length >= 8 },
    { text: "Không chỉ toàn chữ số", ok: password.length > 0 && !/^\d+$/.test(password) },
    { text: "Không phổ biến, không giống tên hay email", ok: password.length > 0 && !looksCommon(password) && !similarTo(password, context) },
    { text: "Thêm ký tự đặc biệt để mạnh hơn", ok: /[^\p{L}\d]/u.test(password), optional: true },
  ];
}
