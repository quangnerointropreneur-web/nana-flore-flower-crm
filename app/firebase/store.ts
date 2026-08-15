import { collection, deleteDoc, doc, DocumentData, getDoc, getDocs, writeBatch } from "firebase/firestore";
import type { Customer, CustomerEvent, CustomerRecipient, DeliveryTask, Invoice, Order, Payment, Product, ProductionTask, Staff, StoreData } from "../types";
import { firestore } from "./client";
import { buildSeedStore } from "./seed";

const root = ["flore_stores","default"] as const;
const entityNames = ["customers","recipients","events","products","orders","payments","invoices","staff","production","deliveries","logs"] as const;
type EntityName = typeof entityNames[number];

const entityCollection=(name:EntityName)=>collection(firestore,...root,name);
const entityDoc=(name:EntityName,id:number)=>doc(firestore,...root,name,String(id));
const metaDoc=(name:string)=>doc(firestore,...root,"meta",name);
const clean=(value:unknown,max=500)=>String(value??"").trim().slice(0,max);
const money=(value:unknown)=>Math.max(0,Math.round(Number(value)||0));
const nextId=(items:{id:number}[])=>items.reduce((max,item)=>Math.max(max,item.id),0)+1;
const now=()=>new Date().toISOString().slice(0,19).replace("T"," ");
const bool=(value:unknown)=>!(value===false||clean(value,10)==="false");
const getById=<T extends {id:number}>(items:T[],id:number,label:string)=>{const item=items.find(entry=>entry.id===id);if(!item)throw new Error(`Không tìm thấy ${label}`);return item};

function friendlyFirebaseError(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  if(message.includes("permission-denied")||message.includes("Missing or insufficient permissions"))return new Error("Firestore chưa cho phép tài khoản này truy cập. Cần xuất bản Security Rules của Floré.");
  if(message.includes("not-found")||message.includes("database"))return new Error("Chưa tìm thấy Cloud Firestore trong dự án Firebase.");
  if(message.includes("offline")||message.includes("network"))return new Error("Không thể kết nối Firebase. Vui lòng kiểm tra mạng rồi thử lại.");
  return error instanceof Error?error:new Error("Không thể kết nối Firebase");
}

async function readCollection<T>(name:EntityName){
  const snapshot=await getDocs(entityCollection(name));
  return snapshot.docs.map(item=>item.data() as T);
}

async function seedFirestore(){
  const seed=buildSeedStore(),batch=writeBatch(firestore);
  for(const name of entityNames){
    for(const item of seed[name])batch.set(entityDoc(name,item.id),item as DocumentData);
  }
  batch.set(metaDoc("settings"),seed.settings as DocumentData);
  batch.set(metaDoc("bootstrap"),{version:1,createdAt:now(),source:"flore-seed"});
  await batch.commit();
}

export async function loadFirebaseStore(allowSeed=true):Promise<StoreData>{
  try{
    const bootstrap=await getDoc(metaDoc("bootstrap"));
    if(!bootstrap.exists()&&allowSeed){await seedFirestore();return loadFirebaseStore(false)}
    const [customers,recipients,events,products,orders,payments,invoices,staff,production,deliveries,logs,settingsSnapshot]=await Promise.all([
      readCollection<Customer>("customers"),readCollection<CustomerRecipient>("recipients"),readCollection<CustomerEvent>("events"),readCollection<Product>("products"),readCollection<Order>("orders"),readCollection<Payment>("payments"),readCollection<Invoice>("invoices"),readCollection<Staff>("staff"),readCollection<ProductionTask>("production"),readCollection<DeliveryTask>("deliveries"),readCollection<StoreData["logs"][number]>("logs"),getDoc(metaDoc("settings")),
    ]);
    const fallback=buildSeedStore().settings;
    return {
      customers:customers.sort((a,b)=>b.totalSpent-a.totalSpent||b.id-a.id),
      recipients:recipients.sort((a,b)=>a.customerId-b.customerId||b.id-a.id),
      events:events.sort((a,b)=>a.eventDate.slice(5).localeCompare(b.eventDate.slice(5))||b.id-a.id),
      products:products.sort((a,b)=>b.id-a.id),
      orders:orders.sort((a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)||a.deliveryTime.localeCompare(b.deliveryTime)||b.id-a.id),
      payments:payments.sort((a,b)=>b.paidAt.localeCompare(a.paidAt)||b.id-a.id),
      invoices:invoices.sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||b.id-a.id),
      staff:staff.sort((a,b)=>a.id-b.id),
      production:production.sort((a,b)=>a.dueAt.localeCompare(b.dueAt)),
      deliveries:deliveries.sort((a,b)=>a.deliveryDate.localeCompare(b.deliveryDate)||a.deliveryTime.localeCompare(b.deliveryTime)),
      logs:logs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id).slice(0,100),
      settings:settingsSnapshot.exists()?settingsSnapshot.data() as StoreData["settings"]:fallback,
    };
  }catch(error){throw friendlyFirebaseError(error)}
}

export async function applyFirebaseAction(data:StoreData,body:Record<string,unknown>):Promise<StoreData>{
  try{
    const action=clean(body.action,50),batch=writeBatch(firestore);
    const put=(name:EntityName,id:number,value:unknown)=>batch.set(entityDoc(name,id),value as DocumentData);
    const remove=(name:EntityName,id:number)=>batch.delete(entityDoc(name,id));
    let nextLog=nextId(data.logs);
    const addLog=(orderId:number,actionName:string,details:string,staffName="Ngọc Lan")=>{const value={id:nextLog++,orderId,action:actionName,details,createdAt:now(),staffName};put("logs",value.id,value)};
    const upsertRecipient=(customerId:number,input:Record<string,unknown>)=>{
      const name=clean(input.recipientName,120),phone=clean(input.recipientPhone,20),address=clean(input.deliveryAddress,300),relationship=clean(input.relationship,60)||"Bản thân";
      if(!name)throw new Error("Tên người nhận là bắt buộc");
      const requestedId=Number(input.recipientId)||0;
      const existing=data.recipients.find(item=>item.customerId===customerId&&(item.id===requestedId||(phone&&item.phone===phone)||item.name.toLocaleLowerCase("vi")===name.toLocaleLowerCase("vi")));
      const recipient:CustomerRecipient=existing?{...existing,name,phone,address,relationship}:{id:nextId(data.recipients),customerId,name,phone,address,relationship,birthday:"",anniversary:"",notes:"",createdAt:now()};
      put("recipients",recipient.id,recipient);return recipient;
    };
    const saveOccasion=(customer:Customer,recipient:CustomerRecipient,input:Record<string,unknown>)=>{
      const type=clean(input.occasionType,60),eventDate=clean(input.occasionDate,10);if(!type||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(eventDate))throw new Error("Vui lòng chọn loại dịp và ngày diễn ra");
      const lead=Math.min(90,Math.max(1,Number(input.remindBefore)||14)),remindDays=JSON.stringify([...new Set([lead,7,3,1])].sort((a,b)=>b-a));
      const existing=data.events.find(item=>item.customerId===customer.id&&item.recipientId===recipient.id&&item.type===type);
      const event:CustomerEvent={id:existing?.id??nextId(data.events),customerId:customer.id,recipientId:recipient.id,type,title:`${type} ${recipient.name}`,eventDate,remindDays,notes:clean(input.occasionNotes,300),createdAt:existing?.createdAt??now(),customerName:customer.name,customerPhone:customer.phone,recipientName:recipient.name,relationship:recipient.relationship};
      put("events",event.id,event);
      if(type==="Sinh nhật")put("recipients",recipient.id,{...recipient,birthday:eventDate});
      if(type==="Kỷ niệm")put("recipients",recipient.id,{...recipient,anniversary:eventDate});
    };

    if(action==="createCustomer"){
      const name=clean(body.name,120),phone=clean(body.phone,20);if(!name||!phone)throw new Error("Tên và số điện thoại là bắt buộc");if(data.customers.some(item=>item.phone===phone))throw new Error("Số điện thoại đã tồn tại");
      const id=nextId(data.customers),customer:Customer={id,code:`CUS-${String(id).padStart(4,"0")}`,type:clean(body.type)||"individual",name,phone,email:clean(body.email,120),address:clean(body.address,300),source:clean(body.source,50)||"Facebook",company:clean(body.company,160),taxCode:clean(body.taxCode,30),segment:"Mới",tags:JSON.stringify(body.tags??[]),notes:clean(body.notes),firstOrderAt:"",lastOrderAt:"",totalOrders:0,totalSpent:0,createdAt:now(),staffName:"Nero Nguyễn"};put("customers",id,customer);
    }else if(action==="updateCustomer"){
      const id=Number(body.id),old=getById(data.customers,id,"khách hàng"),phone=clean(body.phone,20);if(data.customers.some(item=>item.id!==id&&item.phone===phone))throw new Error("Số điện thoại đã tồn tại");
      const customer={...old,name:clean(body.name,120),phone,email:clean(body.email,120),address:clean(body.address,300),source:clean(body.source,50),segment:clean(body.segment,30),company:clean(body.company,160),taxCode:clean(body.taxCode,30),notes:clean(body.notes)};put("customers",id,customer);
      for(const event of data.events.filter(item=>item.customerId===id))put("events",event.id,{...event,customerName:customer.name,customerPhone:customer.phone});
    }else if(action==="deleteCustomer"){
      const id=Number(body.id);if(data.orders.some(item=>item.customerId===id))throw new Error("Không thể xóa khách đã có lịch sử đơn hàng");remove("customers",id);for(const item of data.recipients.filter(entry=>entry.customerId===id))remove("recipients",item.id);for(const item of data.events.filter(entry=>entry.customerId===id))remove("events",item.id);
    }else if(action==="createOccasion"){
      const customer=getById(data.customers,Number(body.customerId),"khách hàng"),recipient=upsertRecipient(customer.id,body);saveOccasion(customer,recipient,body);
    }else if(action==="deleteOccasion")remove("events",Number(body.id));
    else if(action==="createProduct"){
      const name=clean(body.name,160),sku=clean(body.sku,40);if(!name||!sku)throw new Error("Tên và SKU là bắt buộc");if(data.products.some(item=>item.sku.toLowerCase()===sku.toLowerCase()))throw new Error("SKU đã tồn tại");const id=nextId(data.products),product:Product={id,sku,name,category:clean(body.category,60),price:money(body.price),cost:money(body.cost),image:clean(body.image,50)||"💐",status:clean(body.status,30)||"active",sold:0,revenue:0,createdAt:now()};put("products",id,product);
    }else if(action==="updateProduct"){
      const id=Number(body.id),old=getById(data.products,id,"sản phẩm"),sku=clean(body.sku,40);if(data.products.some(item=>item.id!==id&&item.sku.toLowerCase()===sku.toLowerCase()))throw new Error("SKU đã tồn tại");put("products",id,{...old,sku,name:clean(body.name,160),category:clean(body.category,60),price:money(body.price),cost:money(body.cost),status:clean(body.status,30)});
    }else if(action==="deleteProduct"){
      const id=Number(body.id);if(data.orders.some(item=>item.itemProductId===id))throw new Error("Sản phẩm đã phát sinh đơn; hãy chuyển sang Ẩn");remove("products",id);
    }else if(action==="createStaff"){
      const name=clean(body.name,120),email=clean(body.email,160);if(!name||!email)throw new Error("Tên và email nhân viên là bắt buộc");if(data.staff.some(item=>item.email.toLowerCase()===email.toLowerCase()))throw new Error("Email nhân viên đã tồn tại");const id=nextId(data.staff),staff:Staff={id,name,email,phone:clean(body.phone,20),role:clean(body.role,30)||"sales",avatar:"",active:bool(body.active),createdAt:now()};put("staff",id,staff);
    }else if(action==="updateStaff"){
      const id=Number(body.id),old=getById(data.staff,id,"nhân viên"),name=clean(body.name,120),email=clean(body.email,160);if(!name||!email)throw new Error("Thông tin nhân viên không hợp lệ");put("staff",id,{...old,name,email,phone:clean(body.phone,20),role:clean(body.role,30)||"sales",active:bool(body.active)});
    }else if(action==="createOrder"){
      const customerName=clean(body.customerName,120),customerPhone=clean(body.customerPhone,20),recipientName=clean(body.recipientName,120),productId=Number(body.productId)||0,quantity=Math.max(1,Number(body.quantity)||1),product=productId?data.products.find(item=>item.id===productId):undefined,itemName=product?.name||clean(body.itemName,160),unitPrice=product?.price??money(body.unitPrice);
      if(!customerName||!customerPhone||!recipientName||!itemName||unitPrice<=0)throw new Error("Vui lòng hoàn tất khách, người nhận, tên sản phẩm và đơn giá");
      let customer=data.customers.find(item=>item.phone===customerPhone);if(!customer){const id=nextId(data.customers);customer={id,code:`CUS-${String(id).padStart(4,"0")}`,type:"individual",name:customerName,phone:customerPhone,email:"",address:"",source:clean(body.source,50)||"Facebook",company:"",taxCode:"",segment:"Mới",tags:"[]",notes:"",firstOrderAt:"",lastOrderAt:"",totalOrders:0,totalSpent:0,createdAt:now(),staffName:"Nero Nguyễn"}}
      const shippingFee=money(body.shippingFee),discount=money(body.discount),subtotal=unitPrice*quantity,total=Math.max(0,subtotal-discount+shippingFee),paid=Math.min(total,money(body.paid)),id=nextId(data.orders),stamp=new Date(),dateCode=`${String(stamp.getFullYear()).slice(-2)}${String(stamp.getMonth()+1).padStart(2,"0")}${String(stamp.getDate()).padStart(2,"0")}`;
      const order:Order={id,code:`FH-${dateCode}-${String(id).padStart(3,"0")}`,customerId:customer.id,customerName,customerPhone,source:clean(body.source,50)||"Facebook",recipientName,recipientPhone:clean(body.recipientPhone,20),deliveryAddress:clean(body.deliveryAddress,300),mapsUrl:clean(body.mapsUrl,300),deliveryDate:clean(body.deliveryDate,20),deliveryTime:clean(body.deliveryTime,10),deliveryType:clean(body.deliveryType,20)||"delivery",cardMessage:clean(body.cardMessage,800),notes:clean(body.notes,500),status:"Mới",paymentStatus:paid===0?"Chưa thanh toán":paid<total?"Đã cọc":"Đã thanh toán đủ",subtotal,discount,shippingFee,surcharge:0,total,paid,remaining:total-paid,dueDate:paid<total?clean(body.dueDate,20):"",createdAt:now(),staffName:"Nero Nguyễn",itemProductId:product?.id??null,itemName,itemSku:product?.sku||"CUSTOM",quantity,unitPrice};put("orders",id,order);
      const recipient=upsertRecipient(customer.id,body),floristId=Number(body.floristId)||data.settings.workflow.defaultFloristId,shipperId=Number(body.shipperId)||data.settings.workflow.defaultShipperId,florist=data.staff.find(item=>item.id===floristId),shipper=data.staff.find(item=>item.id===shipperId);
      const production:ProductionTask={id,orderId:id,orderCode:order.code,customerName,deliveryDate:order.deliveryDate,deliveryTime:order.deliveryTime,cardMessage:order.cardMessage,status:"Chưa làm",dueAt:`${order.deliveryDate} ${order.deliveryTime}:00`,tone:clean(body.tone,60),flowerTypes:clean(body.flowerTypes,160),instructions:order.notes,referenceImage:"",completedImage:"",floristId,floristName:florist?.name||"Chưa phân công",itemName};put("production",id,production);
      const delivery:DeliveryTask={id,orderId:id,orderCode:order.code,recipientName,recipientPhone:order.recipientPhone,deliveryAddress:order.deliveryAddress,mapsUrl:order.mapsUrl,deliveryDate:order.deliveryDate,deliveryTime:order.deliveryTime,status:"Chờ giao",cod:order.remaining,fee:shippingFee,notes:clean(body.deliveryNotes,300),shipperId,shipperName:shipper?.name||"Chưa phân công"};put("deliveries",id,delivery);addLog(id,"Tạo đơn",`${customerName} đặt ${itemName}`,"Nero Nguyễn");
      put("customers",customer.id,{...customer,name:customerName,lastOrderAt:order.deliveryDate,firstOrderAt:customer.firstOrderAt||order.deliveryDate,totalOrders:customer.totalOrders+1,totalSpent:customer.totalSpent+total,segment:customer.totalOrders>=4?"Thân thiết":customer.totalOrders>=1?"Quay lại":customer.segment});
      if(product)put("products",product.id,{...product,sold:product.sold+quantity,revenue:product.revenue+subtotal-discount});
      if(paid>0){const paymentId=nextId(data.payments),payment:Payment={id:paymentId,orderId:id,orderCode:order.code,customerName,amount:paid,method:clean(body.paymentMethod,40)||"Chuyển khoản",reference:`PAY-${Date.now()}`,notes:"Thanh toán khi tạo đơn",paidAt:now(),staffName:"Nero Nguyễn"};put("payments",paymentId,payment)}
      if((body.saveOccasion===true||clean(body.saveOccasion,10)==="on")&&clean(body.occasionType,60)&&clean(body.occasionDate,10)){saveOccasion(customer,recipient,body);addLog(id,"Lưu dịp đặc biệt",`${clean(body.occasionType,60)} của ${recipientName}`,"Nero Nguyễn")}
    }else if(action==="updateOrder"){
      const id=Number(body.id),old=getById(data.orders,id,"đơn hàng"),productId=Number(body.productId)||0,product=productId?data.products.find(item=>item.id===productId):undefined,itemName=clean(body.itemName,160),quantity=Math.max(1,Number(body.quantity)||1),unitPrice=money(body.unitPrice),shippingFee=money(body.shippingFee),discount=money(body.discount),subtotal=unitPrice*quantity,total=Math.max(0,subtotal-discount+shippingFee);if(!itemName||unitPrice<=0)throw new Error("Tên sản phẩm và đơn giá là bắt buộc");if(total<old.paid)throw new Error(`Tổng mới không thể thấp hơn số tiền đã thu (${old.paid.toLocaleString("vi-VN")}đ)`);
      const updated:Order={...old,customerName:clean(body.customerName,120),customerPhone:clean(body.customerPhone,20),source:clean(body.source,50),recipientName:clean(body.recipientName,120),recipientPhone:clean(body.recipientPhone,20),deliveryAddress:clean(body.deliveryAddress,300),mapsUrl:clean(body.mapsUrl,300),deliveryDate:clean(body.deliveryDate,10),deliveryTime:clean(body.deliveryTime,10),deliveryType:clean(body.deliveryType,20),cardMessage:clean(body.cardMessage,800),notes:clean(body.notes,500),paymentStatus:old.paid===0?"Chưa thanh toán":old.paid<total?"Đã cọc":"Đã thanh toán đủ",subtotal,discount,shippingFee,total,remaining:total-old.paid,itemProductId:product?.id??null,itemName,itemSku:product?.sku||"CUSTOM",quantity,unitPrice};put("orders",id,updated);
      const customer=getById(data.customers,old.customerId,"khách hàng");put("customers",customer.id,{...customer,totalSpent:Math.max(0,customer.totalSpent-old.total+total)});upsertRecipient(customer.id,body);
      const production=data.production.find(item=>item.orderId===id);if(production)put("production",production.id,{...production,customerName:updated.customerName,deliveryDate:updated.deliveryDate,deliveryTime:updated.deliveryTime,cardMessage:updated.cardMessage,dueAt:`${updated.deliveryDate} ${updated.deliveryTime}:00`,tone:clean(body.tone,60),flowerTypes:clean(body.flowerTypes,160),instructions:updated.notes,itemName});
      const delivery=data.deliveries.find(item=>item.orderId===id);if(delivery)put("deliveries",delivery.id,{...delivery,recipientName:updated.recipientName,recipientPhone:updated.recipientPhone,deliveryAddress:updated.deliveryAddress,mapsUrl:updated.mapsUrl,deliveryDate:updated.deliveryDate,deliveryTime:updated.deliveryTime,fee:shippingFee,cod:updated.remaining,notes:clean(body.deliveryNotes,300)});
      if(old.itemProductId){const previous=data.products.find(item=>item.id===old.itemProductId);if(previous)put("products",previous.id,{...previous,sold:Math.max(0,previous.sold-old.quantity),revenue:Math.max(0,previous.revenue-(old.subtotal-old.discount))})}if(product){const base=old.itemProductId===product.id?{...product,sold:Math.max(0,product.sold-old.quantity),revenue:Math.max(0,product.revenue-(old.subtotal-old.discount))}:product;put("products",product.id,{...base,sold:base.sold+quantity,revenue:base.revenue+subtotal-discount})}
      for(const invoice of data.invoices.filter(item=>item.orderId===id))put("invoices",invoice.id,{...invoice,customerName:updated.customerName,customerPhone:updated.customerPhone,customerAddress:updated.deliveryAddress,total,subtotal,discount,shippingFee,paid:updated.paid,remaining:updated.remaining,paymentStatus:updated.paymentStatus,itemName,quantity,unitPrice});addLog(id,"Chỉnh sửa đơn",`Cập nhật thông tin đơn ${old.code}`);
    }else if(action==="deleteOrder"){
      const id=Number(body.id),order=getById(data.orders,id,"đơn hàng"),customer=data.customers.find(item=>item.id===order.customerId);if(customer)put("customers",customer.id,{...customer,totalOrders:Math.max(0,customer.totalOrders-1),totalSpent:Math.max(0,customer.totalSpent-order.total)});if(order.itemProductId){const product=data.products.find(item=>item.id===order.itemProductId);if(product)put("products",product.id,{...product,sold:Math.max(0,product.sold-order.quantity),revenue:Math.max(0,product.revenue-(order.subtotal-order.discount))})}remove("orders",id);for(const [name,items] of [["payments",data.payments],["invoices",data.invoices],["production",data.production],["deliveries",data.deliveries],["logs",data.logs]] as const)for(const item of items.filter(entry=>entry.orderId===id))remove(name,item.id);
    }else if(action==="updateOrderStatus"){
      const id=Number(body.id),status=clean(body.status,50),order=getById(data.orders,id,"đơn hàng"),delivery=data.deliveries.find(item=>item.orderId===id);if(status==="Hoàn thành"&&(delivery?.status!=="Đã giao"||order.paid<order.total))throw new Error("Chỉ hoàn thành khi đơn đã giao và đã thu đủ tiền");put("orders",id,{...order,status});const productionStatus:Record<string,string>={"Mới":"Chưa làm","Đã xác nhận":"Chưa làm","Đã cọc":"Chưa làm","Đang chuẩn bị":"Đang làm","Chờ kiểm tra":"Chờ kiểm tra","Chờ giao":"Chờ kiểm tra","Đang giao":"Chờ kiểm tra","Đã hoàn thiện":"Đã hoàn thiện","Hoàn thành":"Đã hoàn thiện"},deliveryStatus:Record<string,string>={"Chờ giao":"Chờ giao","Đang giao":"Đang giao","Đã hoàn thiện":"Đã giao","Hoàn thành":"Đã giao"};const production=data.production.find(item=>item.orderId===id);if(production&&productionStatus[status])put("production",production.id,{...production,status:productionStatus[status]});if(delivery&&deliveryStatus[status])put("deliveries",delivery.id,{...delivery,status:deliveryStatus[status]});addLog(id,"Cập nhật trạng thái",`Chuyển đơn sang ${status}`);
    }else if(action==="addPayment"){
      const orderId=Number(body.orderId),amount=money(body.amount),order=getById(data.orders,orderId,"đơn hàng"),delivery=data.deliveries.find(item=>item.orderId===orderId);if(amount<=0||amount>order.remaining)throw new Error("Số tiền thanh toán không hợp lệ");const paid=order.paid+amount,completed=paid>=order.total&&delivery?.status==="Đã giao",paymentStatus=paid>=order.total?"Đã thanh toán đủ":"Đã cọc",updated={...order,paid,remaining:order.total-paid,paymentStatus,status:completed?"Hoàn thành":order.status};put("orders",orderId,updated);if(delivery)put("deliveries",delivery.id,{...delivery,cod:updated.remaining});const id=nextId(data.payments),payment:Payment={id,orderId,orderCode:order.code,customerName:order.customerName,amount,method:clean(body.method,40),reference:clean(body.reference,80),notes:clean(body.notes,300),paidAt:now(),staffName:"Ngọc Lan"};put("payments",id,payment);for(const invoice of data.invoices.filter(item=>item.orderId===orderId))put("invoices",invoice.id,{...invoice,paid,remaining:updated.remaining,paymentStatus});addLog(orderId,"Ghi nhận thanh toán",`${amount.toLocaleString("vi-VN")}đ qua ${payment.method}${completed?" · đơn đã hoàn thành":""}`);
    }else if(action==="createInvoice"){
      const orderId=Number(body.orderId),order=getById(data.orders,orderId,"đơn hàng");if(!data.invoices.some(item=>item.orderId===orderId)){const id=nextId(data.invoices),invoice:Invoice={id,number:`INV-${new Date().toISOString().slice(2,7).replace("-","")}-${String(id).padStart(4,"0")}`,orderId,orderCode:order.code,customerName:order.customerName,total:order.total,status:"Đã phát hành",issuedAt:now(),customerPhone:order.customerPhone,customerAddress:order.deliveryAddress,subtotal:order.subtotal,discount:order.discount,shippingFee:order.shippingFee,surcharge:order.surcharge,paid:order.paid,remaining:order.remaining,paymentStatus:order.paymentStatus,itemName:order.itemName,quantity:order.quantity,unitPrice:order.unitPrice};put("invoices",id,invoice)}
    }else if(action==="updateProductionStatus"){
      const id=Number(body.id),requested=clean(body.status,50),status=requested==="Đã hoàn thiện"?"Chờ kiểm tra":requested;if(!["Chưa làm","Đang làm","Chờ kiểm tra"].includes(status))throw new Error("Trạng thái cắm hoa không hợp lệ");const task=getById(data.production,id,"công việc của đơn"),order=getById(data.orders,task.orderId,"đơn hàng"),orderStatus:Record<string,string>={"Chưa làm":"Đã xác nhận","Đang làm":"Đang chuẩn bị","Chờ kiểm tra":"Chờ kiểm tra"};put("production",id,{...task,status});put("orders",order.id,{...order,status:orderStatus[status]});addLog(order.id,"Cập nhật thực hiện",`Cắm hoa: ${status}`);
    }else if(action==="updateProductionAssignment"){
      const id=Number(body.id),staffId=Number(body.staffId),task=getById(data.production,id,"công việc của đơn"),staff=getById(data.staff,staffId,"nhân viên");put("production",id,{...task,floristId:staffId,floristName:staff.name});addLog(task.orderId,"Phân công người làm",staff.name);
    }else if(action==="updateDeliveryStatus"){
      const id=Number(body.id),status=clean(body.status,50),task=getById(data.deliveries,id,"vận đơn"),order=getById(data.orders,task.orderId,"đơn hàng"),orderStatus:Record<string,string>={"Chờ giao":"Chờ giao","Đã lấy hàng":"Đang giao","Đang giao":"Đang giao","Đã giao":order.paid>=order.total?"Hoàn thành":"Đã hoàn thiện","Giao thất bại":"Chờ giao"};put("deliveries",id,{...task,status});put("orders",order.id,{...order,status:orderStatus[status]||"Chờ giao"});const production=data.production.find(item=>item.orderId===order.id);if(production)put("production",production.id,{...production,status:status==="Đã giao"?"Đã hoàn thiện":production.status==="Đã hoàn thiện"?"Chờ kiểm tra":production.status});addLog(order.id,"Cập nhật vận chuyển",`Vận đơn: ${status}`);
    }else if(action==="updateDeliveryAssignment"){
      const id=Number(body.id),staffId=Number(body.staffId),task=getById(data.deliveries,id,"vận đơn"),staff=getById(data.staff,staffId,"nhân viên");put("deliveries",id,{...task,shipperId:staffId,shipperName:staff.name});addLog(task.orderId,"Phân công người giao",staff.name);
    }else if(action==="saveSettings")batch.set(metaDoc("settings"),{shop:body.shop??{},invoice:body.invoice??{},workflow:body.workflow??{},notifications:body.notifications??{}} as DocumentData);
    else throw new Error("Thao tác không được hỗ trợ");

    await batch.commit();return await loadFirebaseStore(false);
  }catch(error){throw friendlyFirebaseError(error)}
}

export async function clearFirebaseDocument(name:EntityName,id:number){await deleteDoc(entityDoc(name,id))}
