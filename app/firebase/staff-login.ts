import type { Staff } from "../types";

// Reserved .invalid domain: username logins never require an employee mailbox.
// The credential is still verified by Firebase, not by a public username index.
export const STAFF_LOGIN_DOMAIN = "staff.nananerospace.invalid";
export const USERNAME_PATTERN = "[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}";

export function normalizeUsername(value: unknown): string {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("Tên đăng nhập cần 3–32 ký tự: chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.");
  return username;
}

export function loginEmailForIdentifier(value: string): string {
  const identifier = value.trim().toLowerCase();
  if (identifier.includes("@")) return identifier; // Existing email accounts stay compatible.
  return `${normalizeUsername(identifier)}@${STAFF_LOGIN_DOMAIN}`;
}

export function staffLoginDetails(body: Record<string, unknown>, role: string, previous?: Staff | null) {
  const email = String(body.email ?? previous?.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email không hợp lệ.");
  const mode = previous?.authUid ? (previous.username ? "username" : "email") : (role === "manager" || body.loginMethod === "email" ? "email" : "username");
  if (mode === "email") {
    if (!email) throw new Error("Cần nhập email đăng nhập cho tài khoản quản lý hoặc tài khoản email.");
    return { email, username: "", loginEmail: email };
  }
  const username = normalizeUsername(body.username ?? previous?.username);
  if (previous?.authUid && username !== previous.username) throw new Error("Tên đăng nhập đã cấp không thể thay đổi. Bạn vẫn có thể sửa tên và thông tin nhân viên.");
  return { email, username, loginEmail: loginEmailForIdentifier(username) };
}

export function canAccessStaffMembership(membership: { active?: boolean; archivedAt?: string; role?: string } | undefined): boolean {
  return membership?.active === true && !membership.archivedAt && ["manager", "sales", "florist", "delivery", "accountant"].includes(membership.role || "");
}
