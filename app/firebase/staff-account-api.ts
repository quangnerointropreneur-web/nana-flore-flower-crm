type AccountResult = { ok: true; [key: string]: unknown };

// Website access and Firebase identity are separate. Never put the Sites
// service credential in browser code or retry an unconfirmed account mutation.
export async function requestStaffAccount(body: Record<string, unknown>, idToken: string, send: typeof fetch = fetch): Promise<AccountResult> {
  let response: Response;
  try {
    response = await send("/api/staff-accounts", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Flore-Auth": `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Chưa thể xác nhận thao tác; hãy kiểm tra lại danh sách tài khoản trước khi thử lại.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (response.redirected || !/^application\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    if (response.redirected || response.status === 401 || response.status === 403) {
      throw new Error("Phiên truy cập website không còn hợp lệ. Hãy tải lại trang và đăng nhập lại vào website, rồi thử lại. Chưa xác nhận lưu hoặc xóa tài khoản.");
    }
    throw new Error("Máy chủ quản lý tài khoản trả về phản hồi không hợp lệ. Chưa thể xác nhận thao tác; hãy kiểm tra lại danh sách tài khoản trước khi thử lại.");
  }

  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error("Không đọc được phản hồi quản lý tài khoản. Chưa thể xác nhận thao tác; hãy kiểm tra lại danh sách tài khoản trước khi thử lại."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Phản hồi quản lý tài khoản không hợp lệ. Chưa thể xác nhận thao tác.");
  const payload = result as Record<string, unknown>;
  if (!response.ok || typeof payload.error === "string") throw new Error(typeof payload.error === "string" ? payload.error : "Không thể lưu tài khoản. Vui lòng thử lại sau.");
  if (payload.ok !== true) throw new Error("Máy chủ chưa xác nhận thao tác thành công. Hãy kiểm tra lại danh sách tài khoản trước khi thử lại.");
  return payload as AccountResult;
}
