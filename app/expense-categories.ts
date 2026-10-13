import type { Expense, ExpenseCategory, StoreData } from "./types";

export const defaultExpenseCategories = (): ExpenseCategory[] => [
  {id:"expense-shop",name:"Chi phí cửa hàng",parentId:null,active:true},
  {id:"expense-material",name:"Nguyên liệu",parentId:null,active:true},
  {id:"expense-fruit",name:"Quả",parentId:null,active:true},
  {id:"expense-accessory",name:"Phụ kiện",parentId:null,active:true},
];
export const expenseCategories = (settings: StoreData["settings"]) => settings.expenseCategories ?? defaultExpenseCategories();
export function categoryIsActive(category: ExpenseCategory, categories: ExpenseCategory[]) {
  return category.active && (!category.parentId || categories.some(parent=>parent.id===category.parentId&&!parent.parentId&&parent.active));
}
export function expenseCategoryInfo(expense: Pick<Expense,"category"|"categoryId">, categories: ExpenseCategory[]) {
  const category=categories.find(item=>item.id===expense.categoryId);
  if(!category)return {rootId:"",rootName:expense.category,name:"",path:expense.category};
  const parent=categories.find(item=>item.id===category.parentId);
  return {rootId:parent?.id||category.id,rootName:parent?.name||category.name,name:parent?category.name:"",path:parent?`${parent.name} / ${category.name}`:category.name};
}
export function expenseInCategory(expense: Expense, id: string, categories: ExpenseCategory[]) {
  if(!id)return true;
  if(id.startsWith("legacy:"))return !expense.categoryId&&expense.category===id.slice(7);
  return expense.categoryId===id || expenseCategoryInfo(expense,categories).rootId===id;
}
export function summarizeExpenseGroups(expenses: Expense[], categories: ExpenseCategory[]) {
  const groups=new Map<string,{key:string;name:string;value:number;count:number}>();
  for(const expense of expenses){const info=expenseCategoryInfo(expense,categories),key=info.rootId||`legacy:${info.rootName}`;const row=groups.get(key)||{key,name:info.rootName,value:0,count:0};row.value+=expense.amount;row.count++;groups.set(key,row)}
  return [...groups.values()].sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,"vi"));
}
export function changeExpenseCategory(categories: ExpenseCategory[], body: Record<string,unknown>) {
  const id=String(body.id||""),old=categories.find(item=>item.id===id);
  if(body.action==="setExpenseCategoryActive"){
    if(!old)throw new Error("Không tìm thấy danh mục chi.");
    return categories.map(item=>item.id===id?{...item,active:body.active===true||body.active==="true"}:item);
  }
  const name=String(body.name||"").trim(),parentId=body.parentId?String(body.parentId):null;
  if(!name||name.length>80)throw new Error("Tên danh mục cần từ 1 đến 80 ký tự.");
  if(id&&!old)throw new Error("Danh mục đã thay đổi. Hãy mở lại danh sách.");
  if(old&&old.parentId!==parentId)throw new Error("Không chuyển danh mục đã tạo sang nhóm khác; hãy tạo mục mới.");
  if(parentId){const parent=categories.find(item=>item.id===parentId);if(!parent||parent.parentId||(!old&&!parent.active)||parent.id===id)throw new Error("Chọn một nhóm lớn đang hoạt động. Chỉ hỗ trợ hai cấp.");}
  const normalized=(value:string)=>value.normalize("NFC").toLocaleLowerCase("vi");
  if(categories.some(item=>item.id!==id&&item.parentId===parentId&&normalized(item.name)===normalized(name)))throw new Error("Tên danh mục đã tồn tại trong nhóm này, kể cả mục đang ngừng sử dụng.");
  return old?categories.map(item=>item.id===id?{...item,name}:item):[...categories,{id:crypto.randomUUID(),name,parentId,active:true}];
}
export function resolveExpenseCategory(body: Record<string,unknown>, categories: ExpenseCategory[], previous?: Expense) {
  if(body.categoryId){
    const selected=categories.find(item=>item.id===String(body.categoryId));
    if(!selected)throw new Error("Danh mục chi không còn tồn tại. Hãy chọn lại.");
    if(!categoryIsActive(selected,categories)&&selected.id!==previous?.categoryId)throw new Error("Danh mục đã ngừng sử dụng. Hãy chọn mục khác.");
    return {categoryId:selected.id,category:expenseCategoryInfo({categoryId:selected.id,category:""},categories).path};
  }
  // An older client may omit the new ID. Keep an existing link only when its
  // category text is unchanged; an explicit different label becomes legacy.
  const category=String(body.category||previous?.category||"Khác").trim().slice(0,160);
  return {categoryId:previous?.categoryId&&category===previous.category?previous.categoryId:"",category};
}
