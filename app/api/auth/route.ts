import { env } from "cloudflare:workers";
import { createSession, destroySession, getSessionUser, verifyPassword } from "../../../db/auth";
import { ensureDatabase } from "../../../db/bootstrap";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    await ensureDatabase();
    return Response.json({user:await getSessionUser(request)});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Không thể kiểm tra đăng nhập"},{status:500});
  }
}

export async function POST(request:Request){
  try{
    await ensureDatabase();
    const body=await request.json() as {action?:string;email?:string;password?:string};
    if(body.action==="logout"){
      return Response.json({ok:true},{headers:{"Set-Cookie":await destroySession(request)}});
    }
    if(body.action!=="login")return Response.json({error:"Thao tác không hợp lệ"},{status:400});
    const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
    const account=await env.DB.prepare("SELECT a.staff_id AS staffId,a.password_hash AS passwordHash,a.password_salt AS passwordSalt,s.id,s.name,s.email,s.role,s.avatar,s.active FROM auth_accounts a JOIN staff s ON s.id=a.staff_id WHERE lower(a.email)=? LIMIT 1").bind(email).first<{staffId:number;passwordHash:string;passwordSalt:string;id:number;name:string;email:string;role:string;avatar:string;active:number}>();
    if(!account||!account.active||!await verifyPassword(password,account.passwordSalt,account.passwordHash))return Response.json({error:"Email hoặc mật khẩu chưa đúng"},{status:401});
    const cookie=await createSession(account.staffId,request);
    await env.DB.prepare("UPDATE auth_accounts SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE staff_id=?").bind(account.staffId).run();
    return Response.json({user:{id:account.id,name:account.name,email:account.email,role:account.role,avatar:account.avatar}},{headers:{"Set-Cookie":cookie}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Không thể đăng nhập"},{status:500});
  }
}
