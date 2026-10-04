"use client";
import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { productStatistics } from "../order-items";
import type { StoreData } from "../types";
const money=(value:number)=>new Intl.NumberFormat("vi-VN").format(value)+"đ";

export default function ProductStatistics({data,createGroup,canManageGroups}:{data:StoreData;createGroup:()=>void;canManageGroups:boolean}){
  const [query,setQuery]=useState("");const [group,setGroup]=useState("");const [from,setFrom]=useState("");const [to,setTo]=useState("");
  const orders=useMemo(()=>data.orders.filter(order=>(!from||order.deliveryDate>=from)&&(!to||order.deliveryDate<=to)),[data.orders,from,to]);
  const rows=useMemo(()=>productStatistics(orders,data.products),[orders,data.products]);
  const visible=rows.filter(row=>(!group||row.group===group)&&`${row.name} ${row.group}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")));
  const groups=[...new Set([...data.settings.workflow.productGroups,...rows.map(row=>row.group)])];
  const exportRows=()=>{const escape=(value:unknown)=>`"${String(value).replace(/"/g,'""')}"`;const csv="\uFEFF"+[["Tên sản phẩm","Nhóm sản phẩm","Số lượng","Số đơn","Giá trị trước giảm","Doanh thu sau giảm"],...visible.map(row=>[row.name,row.group,row.quantity,row.orderCount,row.gross,row.revenue])].map(row=>row.map(escape).join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="thong-ke-san-pham.csv";link.click();URL.revokeObjectURL(url)};
  return <><div className="page-title"><div><span className="eyebrow">BÁN HÀNG</span><h1>Thống kê sản phẩm</h1><p>Thống kê theo tên và nhóm sản phẩm đã nhập trong đơn hàng</p></div><div className="page-actions"><button className="secondary-button" onClick={exportRows}><Download size={16}/>Xuất thống kê</button>{canManageGroups&&<button className="primary-button" onClick={createGroup}><Plus size={16}/>Thêm nhóm sản phẩm</button>}</div></div>
    <div className="category-strip">{["",...groups].map(name=><button key={name} className={group===name?"active":""} onClick={()=>setGroup(name)}>{name||"Tất cả"}<b>{rows.filter(row=>!name||row.group===name).reduce((sum,row)=>sum+row.quantity,0)}</b></button>)}</div>
    <div className="toolbar product-stats-filters"><label className="table-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm tên sản phẩm hoặc nhóm..."/></label><label className="calendar-control"><span>Từ ngày</span><input type="date" value={from} onChange={event=>{setFrom(event.target.value);if(to&&event.target.value>to)setTo(event.target.value)}}/></label><label className="calendar-control"><span>Đến ngày</span><input type="date" min={from} value={to} onChange={event=>setTo(event.target.value)}/></label>{(from||to)&&<button className="text-button" onClick={()=>{setFrom("");setTo("")}}>Tất cả thời gian</button>}</div>
    <div className="product-stats-summary"><span><small>Sản phẩm khác nhau</small><strong>{visible.length}</strong></span><span><small>Tổng số lượng</small><strong>{visible.reduce((sum,row)=>sum+row.quantity,0)}</strong></span><span><small>Doanh thu sản phẩm</small><strong>{money(visible.reduce((sum,row)=>sum+row.revenue,0))}</strong></span></div>
    <div className="surface table-surface product-list"><table><thead><tr><th>Tên sản phẩm</th><th>Nhóm sản phẩm</th><th>Số lượng bán</th><th>Số đơn</th><th>Giá trị trước giảm</th><th>Doanh thu sau giảm</th></tr></thead><tbody>{visible.map(row=><tr key={JSON.stringify([row.name,row.group])}><td><strong>{row.name}</strong></td><td>{row.group}</td><td>{row.quantity}</td><td>{row.orderCount}</td><td>{money(row.gross)}</td><td><strong>{money(row.revenue)}</strong></td></tr>)}</tbody></table>{!visible.length&&<div className="empty-state"><Search size={26}/><strong>Chưa có sản phẩm trong khoảng này</strong><p>Tạo đơn hàng mới để bắt đầu thống kê.</p></div>}</div><p className="field-help">Theo ngày giao / nhận đơn. Không tính đơn hủy và phí giao hàng. Giảm giá đơn được chia theo giá trị từng sản phẩm.</p>
  </>;
}
