import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import {jsPDF} from 'jspdf';

const uri=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile=async path=>ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const helpersUri=uri(await compile('../app/order-items.ts'));
const {parseOrderItems,getOrderItems,itemsSubtotal,itemNetAmounts,productStatistics}=await import(helpersUri);
const seedUri=uri(await compile('../app/firebase/seed.ts'));
const cleanupUri=uri(await compile('../app/firebase/demo-cleanup.ts'));
const line=(name,group,quantity,unitPrice)=>({id:name,name,group,quantity,unitPrice,productId:null,sku:'CUSTOM',tone:'',flowerTypes:''});

test('two different products retain their own price, group and quantity',()=>{
  const items=parseOrderItems([line('Bó hồng','Hoa bó',1,850000),line('Giỏ quả','Giỏ quả',2,650000)],{},['Hoa bó','Giỏ quả']);
  assert.equal(itemsSubtotal(items),2150000);assert.equal(items[1].quantity,2);assert.equal(items[1].group,'Giỏ quả');
  const amounts=itemNetAmounts(items,100001);assert.equal(amounts.reduce((sum,n)=>sum+n,0),2049999);
});
test('empty lines, fractional quantities and invalid prices cannot be saved',()=>{
  for(const items of [[],[line('','Hoa bó',1,5)],[line('Hoa','',1,5)],[line('Hoa','Hoa bó',1.5,5)],[line('Hoa','Hoa bó',1,0)],[line('Hoa','Hoa bó',1,Infinity)]])assert.throws(()=>parseOrderItems(items,{},['Hoa bó']));
});
test('legacy one-product orders still work without rewriting existing data',()=>{
  const legacy={id:1,itemName:'Bó hồng',itemProductId:9,itemSku:'HB-9',quantity:2,unitPrice:100000,status:'Mới',discount:20000};
  assert.equal(getOrderItems(legacy,[{id:9,sku:'HB-9',category:'Hoa bó'}])[0].group,'Hoa bó');
  assert.equal(productStatistics([legacy],[{id:9,sku:'HB-9',category:'Hoa bó'}])[0].revenue,180000);
});
test('statistics exclude cancelled orders, count orders once, and distinguish groups',()=>{
  const first={id:1,items:[line('Hoa','Hoa bó',1,100),line('hoa','Hoa bó',2,100),line('Hoa','Hoa giỏ',1,200)],discount:50,status:'Mới'};
  const cancelled={...first,id:2,status:'Hủy'};
  const rows=productStatistics([first,cancelled]);
  assert.equal(rows.length,2);assert.equal(rows.find(row=>row.group==='Hoa bó').quantity,3);assert.equal(rows.find(row=>row.group==='Hoa bó').orderCount,1);
  assert.equal(rows.reduce((sum,row)=>sum+row.revenue,0),450);
});

// Exercise the actual action code against a Firestore-shaped memory adapter.
// It catches missing items in order, production, delivery and invoice writes.
const firestoreUri=uri(`
const db=()=>globalThis.__flowerOrderDocuments;
const reference=path=>({path,parent:{id:path.split('/').at(-2)}});
export const doc=(_db,...parts)=>reference(parts.join('/'));
export const collection=(_db,...parts)=>reference(parts.join('/'));
const snapshot=ref=>({ref,exists:()=>db().has(ref.path),data:()=>structuredClone(db().get(ref.path))});
export const getDoc=async ref=>snapshot(ref);
export const getDocs=async ref=>({docs:[...db().keys()].filter(path=>path.startsWith(ref.path+'/')&&!path.slice(ref.path.length+1).includes('/')).map(path=>snapshot(reference(path)))});
export const deleteDoc=async ref=>db().delete(ref.path);
export const writeBatch=()=>{const pending=[];return{set:(ref,value)=>pending.push(()=>db().set(ref.path,structuredClone(value))),delete:ref=>pending.push(()=>db().delete(ref.path)),commit:async()=>pending.forEach(write=>write())}};
export const runTransaction=async(_db,callback)=>{const batch=writeBatch();const result=await callback({...batch,get:getDoc});await batch.commit();return result};
`);
const clientUri=uri(`export const firestore={};export const MANAGER_UID='kyEi7WdhTdZ7HfpI9PxxxVLbqNR2';export const firebaseAuth={currentUser:{uid:MANAGER_UID,email:'manager@example.com'}};export const createStaffAuthAccount=()=>{throw Error('Not expected')};export const manageStaffAccount=()=>{throw Error('Not expected')};`);
let storeSource=await compile('../app/firebase/store.ts');
const resetUri=uri((await compile('../app/firebase/sales-reset.ts')).replaceAll('"firebase/firestore"',JSON.stringify(firestoreUri)).replaceAll('"./client"',JSON.stringify(clientUri)));
const {resetConfirmedSalesData,SALES_RESET_ID,SALES_COLLECTIONS}=await import(resetUri);
for(const [name,value] of [['firebase/firestore',firestoreUri],['./client',clientUri],['./seed',seedUri],['./sales-reset',resetUri],['../order-items',helpersUri]])storeSource=storeSource.replaceAll(`"${name}"`,JSON.stringify(value));
const {applyFirebaseAction,loadFirebaseStore}=await import(uri(storeSource));const {buildSeedStore}=await import(seedUri);

test('confirmed reset clears old records despite demo markers and preserves records created later',async()=>{
  const root='flore_stores/default/';const data=buildSeedStore();
  const customer={id:1,name:'Nguyễn Minh Anh',email:'khach1@example.com',phone:'0912000000',createdAt:'2026-08-15 08:00:00',totalSpent:100,totalOrders:1};
  const order={id:1,code:'FH-260815-001',createdAt:'2026-08-01 08:30:00',mapsUrl:'',customerId:1,status:'Mới'};
  const realCustomer={...customer,id:50,name:'Khách thật',email:'real@example.com',createdAt:'2027-01-01 08:00:00'};
  globalThis.__flowerOrderDocuments=new Map([[root+'meta/demoCleanupV2',{completedAt:'old'}],[root+'meta/bootstrap',{version:1}],[root+'meta/settings',data.settings],[root+'customers/1',customer],[root+'customers/50',realCustomer],[root+'orders/1',order]]);
  let loaded=await loadFirebaseStore(false);assert.deepEqual(loaded.customers,[realCustomer]);assert.equal(loaded.orders.length,0);
  const archives=[...globalThis.__flowerOrderDocuments.values()].filter(row=>row.sourcePath);
  assert.equal(archives.length,2);assert.equal(archives.find(row=>row.sourcePath.endsWith('/orders/1')).record.id,1);
  assert.equal(globalThis.__flowerOrderDocuments.get(root+'meta/'+SALES_RESET_ID).deletedCount,2);
  loaded=await loadFirebaseStore(false);assert.deepEqual(loaded.customers,[realCustomer]);assert.equal(loaded.salesReset.completed,true);
});

test('reset uses actual document paths, handles multiple chunks, and never removes settings or accounts',async()=>{
  const root='flore_stores/default/';globalThis.__flowerOrderDocuments=new Map([[root+'meta/settings',{shop:{name:'Cửa hàng thật'}}],[root+'staff/1',{id:1,authUid:'active-user'}],[root+'staffAuth/active-user',{role:'manager',active:true}]]);
  for(const name of SALES_COLLECTIONS)for(let i=0;i<(name==='customers'?110:1);i++)globalThis.__flowerOrderDocuments.set(root+name+'/random-document-'+i,{id:9000+i,createdAt:'2026-01-01 08:00:00'});
  const result=await resetConfirmedSalesData();assert.equal(result.deletedCount,120);assert.equal(result.remainingCount,0);
  for(const name of SALES_COLLECTIONS)assert.equal([...globalThis.__flowerOrderDocuments.keys()].filter(path=>path.startsWith(root+name+'/')).length,0);
  assert.ok(globalThis.__flowerOrderDocuments.has(root+'staff/1'));assert.ok(globalThis.__flowerOrderDocuments.has(root+'staffAuth/active-user'));assert.equal(globalThis.__flowerOrderDocuments.get(root+'meta/settings').shop.name,'Cửa hàng thật');
  assert.equal([...globalThis.__flowerOrderDocuments.values()].filter(row=>row.sourcePath).length,120);
  globalThis.__flowerOrderDocuments.set(root+'customers/new',{id:1,createdAt:'2026-01-01 08:00:00'});
  assert.equal((await resetConfirmedSalesData()).deletedCount,120);assert.ok(globalThis.__flowerOrderDocuments.has(root+'customers/new'));
});

test('only active managers may reset; a newly entered order and linked records survive',async()=>{
  const {firebaseAuth,MANAGER_UID}=await import(clientUri),owner=firebaseAuth.currentUser;
  const root='flore_stores/default/';globalThis.__flowerOrderDocuments=new Map([[root+'staffAuth/employee',{role:'sales',active:true}],[root+'customers/1',{id:1,createdAt:'2026-01-01'}],[root+'orders/new',{id:500,customerId:1,createdAt:'2027-01-01'}],[root+'production/new',{id:1,orderId:500}]]);
  try{
    firebaseAuth.currentUser={uid:'employee'};assert.equal(await resetConfirmedSalesData(),null);assert.ok(globalThis.__flowerOrderDocuments.has(root+'customers/1'));
    globalThis.__flowerOrderDocuments.set(root+'staffAuth/employee',{role:'manager',active:true});
    const result=await resetConfirmedSalesData();assert.equal(result.deletedCount,0);assert.equal(result.remainingCount,3);
    assert.ok(globalThis.__flowerOrderDocuments.has(root+'customers/1'));assert.ok(globalThis.__flowerOrderDocuments.has(root+'production/new'));
  }finally{firebaseAuth.currentUser=owner}
});

test('create, edit, invoice and delete keep every item and payment balance consistent',async()=>{
  globalThis.__flowerOrderDocuments=new Map();let data=buildSeedStore();
  const base={customerName:'Khách thực',customerPhone:'0900123456',deliveryType:'pickup',deliveryDate:'2026-10-04',deliveryTime:'10:30',source:'Zalo',discount:100000,paid:400000,items:[line('Bó hồng','Hoa bó',1,850000),line('Giỏ quả','Giỏ quả',2,650000)]};
  data=await applyFirebaseAction(data,{action:'createOrder',...base});
  assert.equal(data.orders[0].items.length,2);assert.equal(data.orders[0].subtotal,2150000);assert.equal(data.orders[0].total,2050000);assert.equal(data.orders[0].remaining,1650000);assert.equal(data.production[0].items[1].group,'Giỏ quả');assert.equal(data.deliveries[0].cod,1650000);
  const id=data.orders[0].id;
  data=await applyFirebaseAction(data,{action:'createInvoice',orderId:id});assert.equal(data.invoices[0].items.length,2);
  const before=structuredClone(data.orders[0]);
  await assert.rejects(()=>applyFirebaseAction(data,{action:'updateOrder',id,...base,discount:0,items:[line('Quà','Theo yêu cầu',1,1000)]}),/thấp hơn số tiền đã thu/);
  assert.deepEqual(globalThis.__flowerOrderDocuments.get('flore_stores/default/orders/'+id),before);
  data=await applyFirebaseAction(data,{action:'updateOrder',id,...base,discount:0,items:[line('Bó hồng','Hoa bó',2,500000),line('Giỏ quả','Giỏ quả',1,600000),line('Thiệp','Theo yêu cầu',1,50000)]});
  assert.equal(data.orders[0].items.length,3);assert.equal(data.orders[0].total,1650000);assert.equal(data.orders[0].remaining,1250000);assert.equal(data.invoices[0].items.length,3);assert.equal(data.invoices[0].subtotal,1650000);assert.equal(data.deliveries[0].cod,1250000);assert.match(data.production[0].itemName,/Thiệp/);
  data=await applyFirebaseAction(data,{action:'addPayment',orderId:id,amount:1250000,method:'Tiền mặt'});assert.equal(data.orders[0].remaining,0);assert.equal(data.invoices[0].remaining,0);
  data=await applyFirebaseAction(data,{action:'deleteOrder',id});for(const name of ['orders','invoices','payments','production','deliveries'])assert.equal(data[name].length,0);
});
test('new product groups persist once and reject case-insensitive duplicates',async()=>{
  globalThis.__flowerOrderDocuments=new Map();let data=buildSeedStore();
  data=await applyFirebaseAction(data,{action:'createProductGroup',name:'Vòng hoa'});assert.ok(data.settings.workflow.productGroups.includes('Vòng hoa'));
  await assert.rejects(()=>applyFirebaseAction(data,{action:'createProductGroup',name:' vòng HOA '}),/đã tồn tại/);
});

test('invoice PDF includes every product and paginates long orders',async()=>{
  globalThis.__flowerPdfConstructor=jsPDF;
  const pdfLibrary=uri('export const jsPDF=globalThis.__flowerPdfConstructor;');
  const source=(await compile('../app/invoice-pdf.ts')).replaceAll('"jspdf"',JSON.stringify(pdfLibrary)).replaceAll('"./order-items"',JSON.stringify(helpersUri));
  const {buildInvoicePdf}=await import(uri(source));
  const items=Array.from({length:100},(_,i)=>line(`Product ${i+1}`,'Hoa bó',1,100000));
  const invoice={number:'INV-TEST',orderCode:'FL-TEST',customerName:'Test',customerPhone:'0900000000',items,subtotal:10000000,discount:0,shippingFee:0,surcharge:0,total:10000000,paid:0,remaining:10000000};
  const pdf=buildInvoicePdf(invoice,buildSeedStore().settings);
  assert.ok(pdf.getNumberOfPages()>1);const content=pdf.output();
  assert.match(content,/Product 1 /);assert.match(content,/Product 100 /);assert.match(content,/TONG THANH TOAN/);
  delete globalThis.__flowerPdfConstructor;
});
