// Server-only Firebase administration. Service credentials never enter the browser bundle.
export const FIREBASE_PROJECT = "nananerospace";
export const OWNER_UID = "kyEi7WdhTdZ7HfpI9PxxxVLbqNR2";
const API_KEY = "AIzaSyB5ZtSMY78wPpLapxLV4hnacwn85AfS2GY";
const documents = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
type AdminEnv = { FIREBASE_SERVICE_ACCOUNT_JSON?: string };
type Fields = Record<string, { stringValue?: string; integerValue?: string; booleanValue?: boolean }>;
type FirebaseDocument = { name: string; fields: Fields; updateTime: string };
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }

async function googleJson(url: string, token: string, body?: unknown, method = "POST") {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json() as Record<string, any>;
  if (!response.ok) {
    const message = result.error?.message || "FIREBASE_ERROR";
    if (url.endsWith(":delete") && message.includes("USER_NOT_FOUND")) return {};
    if (message.includes("EMAIL_EXISTS")) throw new ApiError("Email này đã có tài khoản đăng nhập.");
    if (message.includes("INVALID_EMAIL")) throw new ApiError("Email đăng nhập không hợp lệ.");
    if (message.includes("PASSWORD")) throw new ApiError("Mật khẩu không đáp ứng yêu cầu của Firebase. Vui lòng dùng ít nhất 6 ký tự.");
    if (response.status === 403) throw new ApiError("Kết nối quản trị chưa có đủ quyền trên Firebase.", 503);
    throw new ApiError("Không thể lưu tài khoản trên Firebase. Vui lòng thử lại.", response.status === 404 ? 404 : 502);
  }
  return result;
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export async function serviceAccessToken(env: AdminEnv) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new ApiError("Chưa kết nối quyền quản trị Firebase. Cần cấu hình khóa Service Account để đổi email, đặt mật khẩu hoặc xóa tài khoản đăng nhập.", 503);
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (account.project_id !== FIREBASE_PROJECT || !account.client_email || !account.private_key) throw new ApiError("Khóa quản trị không thuộc dự án nananerospace.", 503);
  const seconds = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: seconds, exp: seconds + 3600 })}`;
  const pem = account.private_key.replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), char => char.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }) });
  const result = await response.json() as { access_token?: string };
  if (!response.ok || !result.access_token) throw new ApiError("Khóa quản trị Firebase không còn hợp lệ.", 503);
  return result.access_token;
}

async function readDocument(path: string, token: string): Promise<FirebaseDocument | null> {
  const response = await fetch(`${documents}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError("Không thể kiểm tra quyền hoặc hồ sơ nhân viên.", response.status === 403 ? 403 : 502);
  return await response.json() as FirebaseDocument;
}
function fields(value: Record<string, unknown>): Fields {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([key, v]) => [key, typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { stringValue: String(v ?? "") }]));
}
function values(document: FirebaseDocument): Record<string, any> {
  return Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, value.booleanValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.stringValue ?? "")]));
}
function write(path: string, value: Record<string, unknown>, previous: FirebaseDocument | null) {
  return { update: { name: `${documents.slice("https://firestore.googleapis.com/v1/".length)}/${path}`, fields: fields(value) }, currentDocument: previous ? { updateTime: previous.updateTime } : { exists: false } };
}
async function requireManager(request: Request) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) throw new ApiError("Vui lòng đăng nhập trước.", 401);
  // Firebase verifies the token, not just the untrusted JWT payload.
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: bearer }) });
  const result = await response.json() as { users?: { localId: string; disabled?: boolean }[] };
  const user = result.users?.[0];
  if (!response.ok || !user || user.disabled) throw new ApiError("Phiên đăng nhập không còn hợp lệ.", 401);
  if (user.localId !== OWNER_UID) {
    const membership = await readDocument(`flore_stores/default/staffAuth/${user.localId}`, bearer);
    if (!membership || membership.fields.active?.booleanValue !== true || membership.fields.role?.stringValue !== "manager") throw new ApiError("Chỉ quản lý được quản trị tài khoản.", 403);
  }
  return user.localId;
}

export async function handleStaffAccounts(request: Request, env: AdminEnv): Promise<Response> {
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) throw new ApiError("Yêu cầu không hợp lệ.", 403);
    if (request.method !== "POST") return respond({ error: "Phương thức không được hỗ trợ." }, 405);
    const caller = await requireManager(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (!["createStaff", "updateStaff", "deleteStaff"].includes(action)) throw new ApiError("Thao tác không hợp lệ.");
    const token = await serviceAccessToken(env);
    const id = action === "createStaff" ? Date.now() : Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError("Mã nhân viên không hợp lệ.");
    const path = `flore_stores/default/staff/${id}`;
    const previous = await readDocument(path, token);
    if (action !== "createStaff" && !previous) throw new ApiError("Không tìm thấy nhân viên.", 404);
    const old = previous ? values(previous) : null;
    const uid = old?.authUid as string | undefined;
    if (uid === OWNER_UID) throw new ApiError("Tài khoản quản lý chính được giữ lại để bảo đảm quyền truy cập.");
    if (uid === caller && (action === "deleteStaff" || body.role !== "manager" || body.active === false || body.active === "false")) throw new ApiError("Bạn không thể xóa, khóa hoặc hạ quyền tài khoản đang sử dụng.");
    const authPath = uid ? `flore_stores/default/staffAuth/${uid}` : "";
    const previousAuth = uid ? await readDocument(authPath, token) : null;
    const authApi = `https://identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT}/accounts`;
    if (action === "deleteStaff") {
      if (uid) {
        // Remove CRM access before deleting the login; a failed login deletion remains safely blocked.
        if (previousAuth) await googleJson(`${documents}:commit`, token, { writes: [write(authPath, { ...values(previousAuth), active: false }, previousAuth)] });
        try { await googleJson(`${authApi}:delete`, token, { localId: uid }); }
        catch (error) { throw new ApiError(`Đã khóa quyền vào cửa hàng, nhưng chưa xóa được tài khoản đăng nhập. Hãy thử xóa lại. ${error instanceof Error ? error.message : ""}`, 502); }
      }
      const docName = (p: string) => `${documents.slice("https://firestore.googleapis.com/v1/".length)}/${p}`;
      await googleJson(`${documents}:commit`, token, { writes: [{ delete: docName(path), currentDocument: { updateTime: previous!.updateTime } }, ...(uid ? [{ delete: docName(authPath) }] : [])] });
      return respond({ ok: true });
    }
    const name = String(body.name ?? "").trim().slice(0, 120);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "sales");
    const active = body.active !== false && body.active !== "false";
    const createLogin = body.createLogin === true || body.createLogin === "on";
    if (!name || !["manager", "sales", "florist", "delivery", "accountant"].includes(role)) throw new ApiError("Tên hoặc vai trò nhân viên không hợp lệ.");
    if ((uid || createLogin) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("Cần nhập email đăng nhập hợp lệ.");
    if ((createLogin && !uid || password) && (password.length < 6 || password.length > 4096)) throw new ApiError("Mật khẩu phải có ít nhất 6 ký tự.");
    const staff = { ...old, id, name, email, phone: String(body.phone ?? "").trim().slice(0, 20), role, active, avatar: old?.avatar ?? "", createdAt: old?.createdAt ?? new Date().toISOString().slice(0, 19).replace("T", " ") };
    let createdUid: string | undefined;
    if (createLogin && !uid) {
      const created = await googleJson(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, token, { targetProjectId: FIREBASE_PROJECT, email, password, displayName: name, disabled: !active });
      if (!created.localId) throw new ApiError("Firebase chưa trả về tài khoản đã tạo.", 502);
      createdUid = String(created.localId);
    }
    const accountUid = uid || createdUid;
    const membership = accountUid ? { uid: accountUid, staffId: id, name, email, role, active, createdAt: staff.createdAt } : null;
    const writes = [write(path, { ...staff, ...(accountUid ? { authUid: accountUid } : {}) }, previous), ...(membership ? [write(`flore_stores/default/staffAuth/${accountUid}`, membership, previousAuth)] : [])];
    let committed: Record<string, any>;
    try { committed = await googleJson(`${documents}:commit`, token, { writes }); }
    catch (error) { if (createdUid) await googleJson(`${authApi}:delete`, token, { localId: createdUid }).catch(() => undefined); throw error; }
    if (uid) {
      try { await googleJson(`${authApi}:update`, token, { localId: uid, displayName: name, email, disableUser: !active, ...(password ? { password, validSince: String(Math.floor(Date.now() / 1000)) } : {}) }); }
      catch (error) {
        // Restore the directory when Auth rejects the change (e.g. a duplicate email).
        const rollback = [write(path, old!, { ...previous!, updateTime: committed.writeResults[0].updateTime }), ...(previousAuth ? [write(authPath, values(previousAuth), { ...previousAuth, updateTime: committed.writeResults[1].updateTime })] : [{ delete: `${documents.slice("https://firestore.googleapis.com/v1/".length)}/${authPath}`, currentDocument: { updateTime: committed.writeResults[1].updateTime } }])];
        try { await googleJson(`${documents}:commit`, token, { writes: rollback }); }
        catch { throw new ApiError("Thông tin cửa hàng đã thay đổi nhưng tài khoản đăng nhập chưa đồng bộ. Hãy mở lại hồ sơ và lưu lại.", 502); }
        throw error;
      }
    }
    return respond({ ok: true, id });
  } catch (error) {
    return respond({ error: error instanceof ApiError ? error.message : "Không thể xử lý tài khoản. Vui lòng thử lại." }, error instanceof ApiError ? error.status : 500);
  }
}
