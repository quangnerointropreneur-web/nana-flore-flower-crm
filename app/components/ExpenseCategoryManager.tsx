"use client";
import {useState} from "react";
import {Plus,Pencil,Check,LoaderCircle} from "lucide-react";
import {expenseCategories} from "../expense-categories";
import type {ExpenseCategory,StoreData} from "../types";

export default function ExpenseCategoryManager({settings,saving,act}:{settings:StoreData["settings"];saving:boolean;act:(body:Record<string,unknown>,message:string)=>Promise<boolean>}){
  const categories=expenseCategories(settings),roots=categories.filter(item=>!item.parentId);
  const [editing,setEditing]=useState<ExpenseCategory|null>(null),[name,setName]=useState(""),[parentId,setParentId]=useState("");
  const start=(category:ExpenseCategory)=>{setEditing(category);setName(category.name);setParentId(category.parentId||"")};
  const reset=()=>{setEditing(null);setName("");setParentId("")};
  const toggle=(category:ExpenseCategory)=>{
    if(category.active&&!confirm(`Ngừng sử dụng “${category.name}”? Khoản chi cũ vẫn được giữ.${category.parentId?"":" Các mục con cũng không thể chọn cho khoản chi mới."}`))return;
    void act({action:"setExpenseCategoryActive",id:category.id,active:!category.active},category.active?"Đã ngừng sử dụng danh mục":"Đã kích hoạt lại danh mục");
  };
  return <div className="expense-category-manager">
    <p className="field-help">Nhóm lớn chứa các mục con. Đổi tên không mất liên kết khoản chi cũ; ngừng dùng không xóa lịch sử.</p>
    <form className="category-edit-form" onSubmit={async event=>{event.preventDefault();if(await act({action:"saveExpenseCategory",id:editing?.id,name,parentId:parentId||null},editing?"Đã đổi tên danh mục":"Đã thêm danh mục chi"))reset()}}>
      <label className="field"><span>{editing?"Đổi tên danh mục":"Tên nhóm / danh mục mới"}</span><input value={name} onChange={event=>setName(event.target.value)} maxLength={80} placeholder="Nhập tên, ví dụ: Điện nước" required/></label>
      <label className="field"><span>Thuộc nhóm</span><select value={parentId} onChange={event=>setParentId(event.target.value)} disabled={Boolean(editing)}><option value="">Nhóm lớn mới</option>{roots.filter(item=>item.active||editing?.parentId===item.id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin" size={15}/>:editing?<Check size={15}/>:<Plus size={15}/>} {editing?"Lưu tên":"Thêm danh mục"}</button>
      {editing&&<button className="secondary-button" type="button" onClick={reset} disabled={saving}>Hủy sửa</button>}
    </form>
    <div className="category-tree">{roots.map(root=><section key={root.id} className={!root.active?"category-disabled":""}>
      <div className="category-tree-row"><div><strong>{root.name}</strong><small>{root.active?"Nhóm lớn":"Đã ngừng dùng"}</small></div><button className="secondary-button" onClick={()=>{reset();setParentId(root.id)}} disabled={saving||!root.active}><Plus size={13}/>Thêm mục con</button><button className="icon-plain" aria-label={`Đổi tên ${root.name}`} onClick={()=>start(root)} disabled={saving}><Pencil size={14}/></button><button className="text-button" onClick={()=>toggle(root)} disabled={saving}>{root.active?"Ngừng dùng":"Dùng lại"}</button></div>
      {categories.filter(item=>item.parentId===root.id).map(child=><div className="category-tree-row category-child" key={child.id}><div><strong>{child.name}</strong><small>{!root.active?"Tạm ẩn theo nhóm":child.active?"Đang dùng":"Đã ngừng dùng"}</small></div><button className="icon-plain" aria-label={`Đổi tên ${child.name}`} onClick={()=>start(child)} disabled={saving}><Pencil size={14}/></button><button className="text-button" onClick={()=>toggle(child)} disabled={saving}>{child.active?"Ngừng dùng":"Dùng lại"}</button></div>)}
      {!categories.some(item=>item.parentId===root.id)&&<p className="field-help category-empty">Chưa có mục con. Vẫn có thể nhập khoản chi chung cho nhóm này.</p>}
    </section>)}</div>
  </div>;
}
