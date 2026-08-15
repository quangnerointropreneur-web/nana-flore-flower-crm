import { env } from "cloudflare:workers";

export type SessionUser = { id:number; name:string; email:string; role:string; avatar:string };

const encoder=new TextEncoder();
const sessionCookie="flore_session";
const sessionSeconds=60*60*24*7;

const toHex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes)).map(byte=>byte.toString(16).padStart(2,"0")).join("");
const randomHex=(length:number)=>{const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return toHex(bytes)};

export async function hashPassword(password:string,salt=randomHex(16)){
  const material=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:encoder.encode(salt),iterations:210000},material,256);
  return {hash:toHex(bits),salt};
}

export async function verifyPassword(password:string,salt:string,expected:string){
  const {hash}=await hashPassword(password,salt);
  if(hash.length!==expected.length)return false;
  let difference=0;
  for(let index=0;index<hash.length;index+=1)difference|=hash.charCodeAt(index)^expected.charCodeAt(index);
  return difference===0;
}

const hashToken=async(token:string)=>toHex(await crypto.subtle.digest("SHA-256",encoder.encode(token)));

export function sessionToken(request:Request){
  const cookies=request.headers.get("cookie")||"";
  for(const part of cookies.split(";")){
    const [name,...value]=part.trim().split("=");
    if(name===sessionCookie)return decodeURIComponent(value.join("="));
  }
  return "";
}

export async function getSessionUser(request:Request):Promise<SessionUser|null>{
  const token=sessionToken(request);
  if(!token)return null;
  const tokenHash=await hashToken(token);
  return await env.DB.prepare("SELECT s.id,s.name,s.email,s.role,s.avatar FROM auth_sessions a JOIN staff s ON s.id=a.staff_id WHERE a.token_hash=? AND a.expires_at>CURRENT_TIMESTAMP AND s.active=1 LIMIT 1").bind(tokenHash).first<SessionUser>();
}

export async function createSession(staffId:number,request:Request){
  const token=randomHex(32),tokenHash=await hashToken(token);
  const expires=new Date(Date.now()+sessionSeconds*1000).toISOString().slice(0,19).replace("T"," ");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at<=CURRENT_TIMESTAMP"),
    env.DB.prepare("INSERT INTO auth_sessions (staff_id,token_hash,expires_at) VALUES (?,?,?)").bind(staffId,tokenHash,expires),
  ]);
  const secure=new URL(request.url).protocol==="https:"?"; Secure":"";
  return `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionSeconds}${secure}`;
}

export async function destroySession(request:Request){
  const token=sessionToken(request);
  if(token)await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash=?").bind(await hashToken(token)).run();
  const secure=new URL(request.url).protocol==="https:"?"; Secure":"";
  return `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
