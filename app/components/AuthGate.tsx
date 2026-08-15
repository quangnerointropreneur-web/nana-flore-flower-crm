"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Flower2, LoaderCircle, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import type { AuthUser } from "../types";
import FlowerCRM from "./FlowerCRM";

export default function AuthGate(){
  const [user,setUser]=useState<AuthUser|null>(null);
  const [checking,setChecking]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);

  useEffect(()=>{let active=true;fetch("/api/auth",{cache:"no-store"}).then(async response=>await response.json() as {user?:AuthUser|null}).then(payload=>{if(active)setUser(payload.user||null)}).catch(()=>{if(active)setUser(null)}).finally(()=>{if(active)setChecking(false)});return()=>{active=false}},[]);

  const login=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setError("");try{const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"login",email,password})});const payload=await response.json() as {user?:AuthUser;error?:string};if(!response.ok||!payload.user)throw new Error(payload.error||"Không thể đăng nhập");setUser(payload.user)}catch(cause){setError(cause instanceof Error?cause.message:"Không thể đăng nhập")}finally{setSaving(false)}};
  const logout=async()=>{await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})}).catch(()=>undefined);setUser(null);setPassword("")};

  if(checking)return <div className="auth-loading"><span className="auth-logo"><Flower2 size={24}/></span><LoaderCircle className="spin" size={25}/><strong>Đang kiểm tra phiên đăng nhập...</strong></div>;
  if(user)return <FlowerCRM user={user} onLogout={()=>void logout()}/>;

  return <main className="login-page"><section className="login-story"><div className="login-brand"><span><Flower2 size={24}/></span><div><strong>Floré</strong><small>Flower Studio</small></div></div><div className="login-message"><span className="eyebrow">QUẢN LÝ TIỆM HOA</span><h1>Mọi đơn hoa,<br/>gọn trong một nơi.</h1><p>Theo dõi khách hàng, cắm hoa, giao đơn và thanh toán xuyên suốt từ lúc nhận đơn đến khi hoàn tất.</p><div className="login-features"><span><ShieldCheck size={16}/>Dữ liệu chỉ mở sau khi đăng nhập</span><span><LockKeyhole size={16}/>Phiên làm việc được ghi nhớ 7 ngày</span></div></div><footer>Floré · Vận hành cửa hàng nhẹ nhàng hơn mỗi ngày</footer></section><section className="login-panel"><form className="login-card" onSubmit={login}><div className="login-card-heading"><span><LockKeyhole size={19}/></span><div><h2>Đăng nhập</h2><p>Chào mừng bạn quay lại Floré</p></div></div><label><span>Email nhân viên</span><input type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} placeholder="ten@flore.vn" required/></label><label><span>Mật khẩu</span><div className="password-input"><input type={showPassword?"text":"password"} autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Nhập mật khẩu" required/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Ẩn mật khẩu":"Hiện mật khẩu"}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<div className="login-error">{error}</div>}<button className="login-submit" disabled={saving}>{saving?<LoaderCircle className="spin" size={18}/>:<LogIn size={18}/>}Đăng nhập vào cửa hàng</button><p className="login-security-note"><ShieldCheck size={14}/>Tài khoản và mật khẩu do quản lý cửa hàng cấp.</p></form></section></main>;
}
