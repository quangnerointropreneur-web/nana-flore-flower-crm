import {collection, doc, getDoc, getDocs, runTransaction, type DocumentData} from "firebase/firestore";
import {firebaseAuth, firestore, MANAGER_UID} from "./client";
import type {SalesResetReport} from "../types";

// The owner confirmed existing sales records were test data on this date.
export const SALES_RESET_ID="salesReset20261005";
export const SALES_RESET_CUTOFF="2026-10-04 17:17:51";
const root=["flore_stores","default"] as const;
export const SALES_COLLECTIONS=["customers","recipients","events","products","orders","payments","expenses","invoices","production","deliveries","logs"] as const;
const stamp=()=>new Date().toISOString().slice(0,19).replace("T"," ");
const marker=()=>doc(firestore,...root,"meta",SALES_RESET_ID);
function timestamp(value:unknown){
  if(typeof value==="string")return value.replace("T"," ").slice(0,19);
  if(value&&typeof value==="object"&&"seconds" in value)return new Date(Number(value.seconds)*1000).toISOString().slice(0,19).replace("T"," ");
  return "";
}
function isExisting(data:DocumentData){
  const created=timestamp(data.createdAt||data.paidAt||data.issuedAt);
  return !created||created<=SALES_RESET_CUTOFF;
}
async function isManager(){
  const user=firebaseAuth.currentUser;
  if(!user)return false;
  if(user.uid===MANAGER_UID)return true;
  const membership=await getDoc(doc(firestore,...root,"staffAuth",user.uid));
  return membership.exists()&&membership.data().active===true&&membership.data().role==="manager";
}

export async function resetConfirmedSalesData():Promise<SalesResetReport|null>{
  if(!await isManager())return null;
  const previous=await getDoc(marker());
  if(previous.exists()&&previous.data().completed===true)return previous.data() as SalesResetReport;
  const snapshots=await Promise.all(SALES_COLLECTIONS.map(name=>getDocs(collection(firestore,...root,name))));
  const newOrders=snapshots[SALES_COLLECTIONS.indexOf("orders")].docs.map(row=>row.data()).filter(row=>!isExisting(row));
  const keepCustomer=new Set(newOrders.map(row=>String(row.customerId)));
  const keepProduct=new Set(newOrders.flatMap(row=>[row.itemProductId,...(row.items||[]).map((item:{productId?:number})=>item.productId)]).filter(Boolean).map(String));
  const keepOrder=new Set(newOrders.map(row=>String(row.id)));
  const protectedRecord=(name:string,data:DocumentData)=>
    name==="customers"?keepCustomer.has(String(data.id)):
    name==="products"?keepProduct.has(String(data.id)):
    name==="recipients"||name==="events"?keepCustomer.has(String(data.customerId)):
    ["production","deliveries","payments","invoices","logs"].includes(name)?keepOrder.has(String(data.orderId)):false;
  for(const [index,name] of SALES_COLLECTIONS.entries()){
    const targets=snapshots[index].docs.filter(row=>isExisting(row.data())&&!protectedRecord(name,row.data()));
    for(let offset=0;offset<targets.length;offset+=100){
      const chunk=targets.slice(offset,offset+100);
      await runTransaction(firestore,async transaction=>{
        const progress=await transaction.get(marker());
        if(progress.exists()&&progress.data().completed===true)return;
        const current=await Promise.all(chunk.map(row=>transaction.get(row.ref)));
        const counts={...(progress.data()?.counts||{})} as Record<string,number>;
        let deleted=0;
        for(const row of current){
          if(!row.exists()||!isExisting(row.data())||protectedRecord(name,row.data()))continue;
          // Delete the actual document reference, not an assumed numeric ID path.
          const key=encodeURIComponent(row.ref.path);
          transaction.set(doc(firestore,...root,"meta",SALES_RESET_ID+"_archive_"+key),{sourcePath:row.ref.path,archivedAt:stamp(),record:row.data()});
          transaction.delete(row.ref);deleted++;
        }
        counts[name]=(counts[name]||0)+deleted;
        transaction.set(marker(),{completed:false,cutoff:SALES_RESET_CUTOFF,counts,deletedCount:Number(progress.data()?.deletedCount||0)+deleted,startedAt:progress.data()?.startedAt||stamp()});
      });
    }
  }
  const verification=await Promise.all(SALES_COLLECTIONS.map(name=>getDocs(collection(firestore,...root,name))));
  const remainingTargets=verification.reduce((sum,snapshot,index)=>sum+snapshot.docs.filter(row=>isExisting(row.data())&&!protectedRecord(SALES_COLLECTIONS[index],row.data())).length,0);
  if(remainingTargets)throw new Error("Chưa dọn hết dữ liệu cũ ("+remainingTargets+" bản ghi). Vui lòng bấm Thử lại; dữ liệu mới và tài khoản vẫn được giữ.");
  return runTransaction(firestore,async transaction=>{
    const current=await transaction.get(marker());
    if(current.data()?.completed===true)return current.data() as SalesResetReport;
    const report:SalesResetReport={completed:true,deletedCount:Number(current.data()?.deletedCount||0),counts:current.data()?.counts||{},completedAt:stamp(),remainingCount:verification.reduce((sum,snapshot)=>sum+snapshot.docs.length,0)};
    transaction.set(marker(),{...current.data(),...report,cutoff:SALES_RESET_CUTOFF});
    return report;
  });
}
