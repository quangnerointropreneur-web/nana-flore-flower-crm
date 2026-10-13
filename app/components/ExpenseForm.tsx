"use client";
import {useState} from "react";
import {Check,LoaderCircle} from "lucide-react";
import {categoryIsActive,expenseCategories} from "../expense-categories";
import type {Expense,StoreData} from "../types";

export default function ExpenseForm({expense,settings,saving,submit}:{expense:Expense|null;settings:StoreData["settings"];saving:boolean;submit:(body:Record<string,unknown>)=>void}){
  const categories=expenseCategories(settings),selected=categories.find(item=>item.id===expense?.categoryId);
  const [rootId,setRootId]=useState(selected?.parentId||selected?.id||(expense?"":categories.find(item=>!item.parentId&&item.active)?.id||""));
  const [childId,setChildId]=useState(selected?.parentId?selected.id:"");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const roots=categories.filter(item=>!item.parentId&&(item.active||item.id===rootId));
  const children=categories.filter(item=>item.parentId===rootId&&(categoryIsActive(item,categories)||item.id===childId));
  return <form onSubmit={event=>{event.preventDefault();submit(Object.fromEntries(new FormData(event.currentTarget).entries()))}}><input type="hidden" name="categoryId" value={childId||rootId}/>
    {expense&&!selected&&<p className="field-help">Khoản chi cũ đang ghi “{expense.category}”. Chọn nhóm bên dưới khi lưu để phân loại vào danh mục mới.</p>}
    <div className="form-grid">
      <label className="field"><span>Ngày chi</span><input name="date" type="date" defaultValue={expense?.date||today} required/></label>
      <label className="field"><span>Nhóm chi</span><select value={rootId} onChange={event=>{setRootId(event.target.value);setChildId("")}} required><option value="" disabled>Chọn nhóm lớn</option>{roots.map(item=><option key={item.id} value={item.id}>{item.name}{item.active?"":" (ngừng dùng)"}</option>)}</select></label>
      <label className="field"><span>Danh mục con (nếu có)</span><select value={childId} onChange={event=>setChildId(event.target.value)} disabled={!rootId}><option value="">Khoản chi chung của nhóm</option>{children.map(item=><option key={item.id} value={item.id}>{item.name}{categoryIsActive(item,categories)?"":" (ngừng dùng)"}</option>)}</select></label>
      <label className="field"><span>Số tiền</span><input name="amount" type="number" min="1" step="1" defaultValue={expense?.amount} required/></label>
      <label className="field"><span>Phương thức</span><select name="paymentMethod" defaultValue={expense?.paymentMethod||"Tiền mặt"}><option>Tiền mặt</option><option>Chuyển khoản</option><option>QR</option><option>Thẻ</option><option>Ví điện tử</option></select></label>
      <label className="field"><span>Nhà cung cấp / người nhận</span><input name="vendor" defaultValue={expense?.vendor} placeholder="Nhà cung cấp hoặc người nhận tiền"/></label>
      <label className="field span-2"><span>Ghi chú</span><textarea name="notes" defaultValue={expense?.notes} placeholder="Nội dung khoản chi..."/></label>
    </div><div className="modal-footer"><button className="primary-button" disabled={saving||!rootId}>{saving?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Lưu chi phí</button></div>
  </form>;
}
