import { env } from "cloudflare:workers";
import { all, ensureDatabase, run } from "../../../db/bootstrap";
import { getSessionUser } from "../../../db/auth";

export const dynamic = "force-dynamic";

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const money = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

async function upsertRecipient(customerId:number, input:Record<string,unknown>) {
  const name=text(input.recipientName,120),phone=text(input.recipientPhone,20),address=text(input.deliveryAddress,300),relationship=text(input.relationship,60);
  if(!name) throw new Error("Tên người nhận là bắt buộc");
  const requestedId=Number(input.recipientId)||0;
  let recipient=requestedId?await env.DB.prepare("SELECT id FROM customer_recipients WHERE id=? AND customer_id=?").bind(requestedId,customerId).first<{id:number}>():null;
  if(!recipient) recipient=await env.DB.prepare("SELECT id FROM customer_recipients WHERE customer_id=? AND ((?<>'' AND phone=?) OR lower(name)=lower(?)) LIMIT 1").bind(customerId,phone,phone,name).first<{id:number}>();
  if(recipient){await run("UPDATE customer_recipients SET name=?,phone=?,address=?,relationship=CASE WHEN ?<>'' THEN ? ELSE relationship END,updated_at=CURRENT_TIMESTAMP WHERE id=?",name,phone,address,relationship,relationship,recipient.id);return recipient.id;}
  const inserted=await env.DB.prepare("INSERT INTO customer_recipients (customer_id,name,phone,address,relationship) VALUES (?,?,?,?,?) RETURNING id").bind(customerId,name,phone,address,relationship).first<{id:number}>();
  if(!inserted?.id) throw new Error("Không thể lưu người nhận");
  return inserted.id;
}

async function saveCustomerEvent(customerId:number,recipientId:number,input:Record<string,unknown>){
  const type=text(input.occasionType,60),eventDate=text(input.occasionDate,10);
  if(!type||!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error("Vui lòng chọn loại dịp và ngày diễn ra");
  const recipient=await env.DB.prepare("SELECT name FROM customer_recipients WHERE id=? AND customer_id=?").bind(recipientId,customerId).first<{name:string}>();
  if(!recipient) throw new Error("Người nhận không hợp lệ");
  const lead=Math.min(90,Math.max(1,Number(input.remindBefore)||14));
  const remindDays=JSON.stringify([...new Set([lead,7,3,1])].sort((a,b)=>b-a));
  const title=`${type} ${recipient.name}`;
  const existing=await env.DB.prepare("SELECT id FROM customer_events WHERE customer_id=? AND recipient_id=? AND type=? LIMIT 1").bind(customerId,recipientId,type).first<{id:number}>();
  if(existing) await run("UPDATE customer_events SET title=?,event_date=?,remind_days=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",title,eventDate,remindDays,text(input.occasionNotes,300),existing.id);
  else await run("INSERT INTO customer_events (customer_id,recipient_id,type,title,event_date,remind_days,notes) VALUES (?,?,?,?,?,?,?)",customerId,recipientId,type,title,eventDate,remindDays,text(input.occasionNotes,300));
  if(type==="Sinh nhật") await run("UPDATE customer_recipients SET birthday=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",eventDate,recipientId);
  if(type==="Kỷ niệm") await run("UPDATE customer_recipients SET anniversary=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",eventDate,recipientId);
}

async function loadStore() {
  await ensureDatabase();
  const [customers, recipients, events, products, orders, payments, invoices, staff, production, deliveries, logs, settingRows] = await Promise.all([
    all(`SELECT c.id,c.code,c.type,c.name,c.phone,c.email,c.address,c.source,c.company,c.tax_code AS taxCode,c.segment,c.tags,c.notes,c.first_order_at AS firstOrderAt,c.last_order_at AS lastOrderAt,c.total_orders AS totalOrders,c.total_spent AS totalSpent,c.created_at AS createdAt,s.name AS staffName FROM customers c LEFT JOIN staff s ON s.id=c.staff_id ORDER BY c.total_spent DESC,c.id DESC`),
    all(`SELECT id,customer_id AS customerId,name,phone,address,relationship,birthday,anniversary,notes,created_at AS createdAt FROM customer_recipients ORDER BY customer_id,id DESC`),
    all(`SELECT e.id,e.customer_id AS customerId,e.recipient_id AS recipientId,e.type,e.title,e.event_date AS eventDate,e.remind_days AS remindDays,e.notes,e.created_at AS createdAt,c.name AS customerName,c.phone AS customerPhone,COALESCE(r.name,c.name) AS recipientName,COALESCE(r.relationship,'Bản thân') AS relationship FROM customer_events e JOIN customers c ON c.id=e.customer_id LEFT JOIN customer_recipients r ON r.id=e.recipient_id ORDER BY substr(e.event_date,6,5),e.id DESC`),
    all(`SELECT id,sku,name,category,price,cost,image,status,sold,revenue,created_at AS createdAt FROM products ORDER BY id DESC`),
    all(`SELECT o.id,o.code,o.customer_id AS customerId,o.customer_name AS customerName,o.customer_phone AS customerPhone,o.source,o.recipient_name AS recipientName,o.recipient_phone AS recipientPhone,o.delivery_address AS deliveryAddress,o.maps_url AS mapsUrl,o.delivery_date AS deliveryDate,o.delivery_time AS deliveryTime,o.delivery_type AS deliveryType,o.card_message AS cardMessage,o.notes,o.status,o.payment_status AS paymentStatus,o.subtotal,o.discount,o.shipping_fee AS shippingFee,o.surcharge,o.total,o.paid,(o.total-o.paid) AS remaining,o.due_date AS dueDate,o.created_at AS createdAt,s.name AS staffName,oi.product_id AS itemProductId,oi.name AS itemName,oi.sku AS itemSku,oi.quantity,oi.unit_price AS unitPrice FROM orders o LEFT JOIN staff s ON s.id=o.staff_id LEFT JOIN order_items oi ON oi.id=(SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id=o.id) ORDER BY o.delivery_date ASC,o.delivery_time ASC,o.id DESC`),
    all(`SELECT p.id,p.order_id AS orderId,o.code AS orderCode,o.customer_name AS customerName,p.amount,p.method,p.reference,p.notes,p.paid_at AS paidAt,s.name AS staffName FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN staff s ON s.id=p.staff_id ORDER BY p.paid_at DESC,p.id DESC`),
    all(`SELECT i.id,i.number,i.order_id AS orderId,o.code AS orderCode,i.customer_name AS customerName,i.total,i.status,i.issued_at AS issuedAt,o.customer_phone AS customerPhone,o.delivery_address AS customerAddress,o.subtotal,o.discount,o.shipping_fee AS shippingFee,o.surcharge,o.paid,(o.total-o.paid) AS remaining,o.payment_status AS paymentStatus,oi.name AS itemName,oi.quantity,oi.unit_price AS unitPrice FROM invoices i JOIN orders o ON o.id=i.order_id LEFT JOIN order_items oi ON oi.id=(SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id=o.id) ORDER BY i.issued_at DESC`),
    all(`SELECT id,name,email,phone,role,avatar,active,created_at AS createdAt FROM staff ORDER BY id`),
    all(`SELECT p.id,p.order_id AS orderId,o.code AS orderCode,o.customer_name AS customerName,o.delivery_date AS deliveryDate,o.delivery_time AS deliveryTime,o.card_message AS cardMessage,CASE WHEN d.status='Đã giao' THEN 'Đã hoàn thiện' WHEN p.status='Đã hoàn thiện' THEN 'Chờ kiểm tra' ELSE p.status END AS status,p.due_at AS dueAt,p.tone,p.flower_types AS flowerTypes,p.instructions,p.reference_image AS referenceImage,p.completed_image AS completedImage,p.florist_id AS floristId,s.name AS floristName,oi.name AS itemName FROM production_tasks p JOIN orders o ON o.id=p.order_id LEFT JOIN delivery d ON d.order_id=p.order_id LEFT JOIN staff s ON s.id=p.florist_id LEFT JOIN order_items oi ON oi.id=(SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id=o.id) ORDER BY p.due_at`),
    all(`SELECT d.id,d.order_id AS orderId,o.code AS orderCode,o.recipient_name AS recipientName,o.recipient_phone AS recipientPhone,o.delivery_address AS deliveryAddress,o.maps_url AS mapsUrl,o.delivery_date AS deliveryDate,o.delivery_time AS deliveryTime,d.status,d.cod,d.fee,d.notes,d.shipper_id AS shipperId,s.name AS shipperName FROM delivery d JOIN orders o ON o.id=d.order_id LEFT JOIN staff s ON s.id=d.shipper_id ORDER BY o.delivery_date,o.delivery_time`),
    all(`SELECT l.id,l.order_id AS orderId,l.action,l.details,l.created_at AS createdAt,s.name AS staffName FROM activity_logs l LEFT JOIN staff s ON s.id=l.staff_id ORDER BY l.created_at DESC,l.id DESC LIMIT 100`),
    all<{key:string;value:string}>(`SELECT key,value FROM settings`),
  ]);
  const storedSettings = Object.fromEntries(settingRows.map((row: { key: string; value: string }) => {
    try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, row.value]; }
  }));
  const settings = {
    shop: storedSettings.shop ?? { name:"Floré Flower Studio",address:"",hotline:"",website:"",facebook:"",bank:"",footer:"" },
    invoice: storedSettings.invoice ?? { showPhone:true,showAddress:true,showDiscount:true,showShipping:true,showQr:true },
    workflow: storedSettings.workflow ?? { productGroups:["Hoa bó","Hoa giỏ","Hoa hộp","Hoa bình","Giỏ quả","Giỏ quả & hoa","Hoa sự kiện","Theo yêu cầu"],defaultShippingFee:50000,defaultFloristId:3,defaultShipperId:4 },
    notifications: storedSettings.notifications ?? { dueSoon:true,unpaid:true,specialOccasion:true },
  };
  return { customers, recipients, events, products, orders, payments, invoices, staff, production, deliveries, logs, settings };
}

export async function GET(request:Request) {
  try { await ensureDatabase();if(!await getSessionUser(request))return Response.json({error:"Vui lòng đăng nhập"},{status:401});return Response.json(await loadStore()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tải dữ liệu" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    if(!await getSessionUser(request))return Response.json({error:"Phiên đăng nhập đã hết hạn"},{status:401});
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 50);

    if (action === "createCustomer") {
      const name = text(body.name, 120), phone = text(body.phone, 20);
      if (!name || !phone) return Response.json({ error: "Tên và số điện thoại là bắt buộc" }, { status: 400 });
      const max = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM customers").first<{next:number}>();
      await run("INSERT INTO customers (code,type,name,phone,email,address,source,staff_id,company,tax_code,segment,tags,notes,first_order_at,last_order_at,total_orders,total_spent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        `CUS-${String(max?.next ?? 1).padStart(4,"0")}`, text(body.type) || "individual", name, phone, text(body.email,120), text(body.address,300), text(body.source,50) || "Facebook", 2, text(body.company,160), text(body.taxCode,30), "Mới", JSON.stringify(body.tags ?? []), text(body.notes), "", "", 0, 0);
    } else if (action === "updateCustomer") {
      const id = Number(body.id); if (!id) throw new Error("Khách hàng không hợp lệ");
      await run("UPDATE customers SET name=?,phone=?,email=?,address=?,source=?,segment=?,company=?,tax_code=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", text(body.name,120), text(body.phone,20), text(body.email,120), text(body.address,300), text(body.source,50), text(body.segment,30), text(body.company,160), text(body.taxCode,30), text(body.notes), id);
    } else if (action === "deleteCustomer") {
      const id = Number(body.id); const used = await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_id=?").bind(id).first<{count:number}>();
      if ((used?.count ?? 0) > 0) return Response.json({ error: "Không thể xóa khách đã có lịch sử đơn hàng" }, { status: 409 });
      await run("DELETE FROM customers WHERE id=?", id);
    } else if (action === "createOccasion") {
      const customerId=Number(body.customerId);
      const customer=await env.DB.prepare("SELECT id FROM customers WHERE id=?").bind(customerId).first<{id:number}>();
      if(!customer) return Response.json({error:"Khách hàng không hợp lệ"},{status:400});
      const recipientId=await upsertRecipient(customerId,body);
      await saveCustomerEvent(customerId,recipientId,body);
    } else if (action === "deleteOccasion") {
      await run("DELETE FROM customer_events WHERE id=?",Number(body.id));
    } else if (action === "createProduct") {
      const name = text(body.name,160), sku = text(body.sku,40); if (!name || !sku) throw new Error("Tên và SKU là bắt buộc");
      await run("INSERT INTO products (sku,name,category,price,cost,image,status) VALUES (?,?,?,?,?,?,?)", sku,name,text(body.category,60),money(body.price),money(body.cost),text(body.image,50) || "💐",text(body.status,30) || "active");
    } else if (action === "updateProduct") {
      await run("UPDATE products SET sku=?,name=?,category=?,price=?,cost=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",text(body.sku,40),text(body.name,160),text(body.category,60),money(body.price),money(body.cost),text(body.status,30),Number(body.id));
    } else if (action === "deleteProduct") {
      const id = Number(body.id); const used = await env.DB.prepare("SELECT COUNT(*) AS count FROM order_items WHERE product_id=?").bind(id).first<{count:number}>();
      if ((used?.count ?? 0) > 0) return Response.json({ error: "Sản phẩm đã phát sinh đơn; hãy chuyển sang Ẩn" }, { status: 409 });
      await run("DELETE FROM products WHERE id=?", id);
    } else if (action === "createStaff") {
      const name=text(body.name,120),email=text(body.email,160);
      if(!name||!email) return Response.json({error:"Tên và email nhân viên là bắt buộc"},{status:400});
      await run("INSERT INTO staff (name,email,phone,role,active) VALUES (?,?,?,?,?)",name,email,text(body.phone,20),text(body.role,30)||"sales",body.active===false||text(body.active,10)==="false"?0:1);
    } else if (action === "updateStaff") {
      const id=Number(body.id),name=text(body.name,120),email=text(body.email,160);
      if(!id||!name||!email) return Response.json({error:"Thông tin nhân viên không hợp lệ"},{status:400});
      await run("UPDATE staff SET name=?,email=?,phone=?,role=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",name,email,text(body.phone,20),text(body.role,30)||"sales",body.active===false||text(body.active,10)==="false"?0:1,id);
    } else if (action === "createOrder") {
      const customerName = text(body.customerName,120), customerPhone = text(body.customerPhone,20), recipientName = text(body.recipientName,120);
      const productId = Number(body.productId), quantity = Math.max(1, Number(body.quantity) || 1);
      const product = productId ? await env.DB.prepare("SELECT id,sku,name,price,category FROM products WHERE id=?").bind(productId).first<{id:number;sku:string;name:string;price:number;category:string}>() : null;
      const itemName = product?.name || text(body.itemName,160), itemPrice = product?.price ?? money(body.unitPrice), itemSku = product?.sku || "CUSTOM";
      const itemCategory = product?.category || text(body.category,80) || "Theo yêu cầu";
      if (!customerName || !customerPhone || !recipientName || !itemName || itemPrice <= 0) return Response.json({ error: "Vui lòng hoàn tất khách, người nhận, tên sản phẩm và đơn giá" }, { status: 400 });
      let customer = await env.DB.prepare("SELECT id FROM customers WHERE phone=?").bind(customerPhone).first<{id:number}>();
      if (!customer) {
        const next = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM customers").first<{next:number}>();
        customer = await env.DB.prepare("INSERT INTO customers (code,name,phone,source,staff_id,segment,tags) VALUES (?,?,?,?,?,?,?) RETURNING id").bind(`CUS-${String(next?.next ?? 1).padStart(4,"0")}`,customerName,customerPhone,text(body.source,50) || "Facebook",2,"Mới","[]").first<{id:number}>();
      }
      const shipping = money(body.shippingFee), discount = money(body.discount), subtotal = itemPrice * quantity, total = Math.max(0,subtotal-discount+shipping), paid = Math.min(total,money(body.paid));
      const nextOrder = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM orders").first<{next:number}>();
      const code = `FH-260815-${String(nextOrder?.next ?? 1).padStart(3,"0")}`;
      const inserted = await env.DB.prepare("INSERT INTO orders (code,customer_id,customer_name,customer_phone,source,staff_id,recipient_name,recipient_phone,delivery_address,maps_url,delivery_date,delivery_time,delivery_type,card_message,notes,status,payment_status,subtotal,discount,shipping_fee,surcharge,total,paid,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id").bind(code,customer?.id,customerName,customerPhone,text(body.source,50) || "Facebook",2,recipientName,text(body.recipientPhone,20),text(body.deliveryAddress,300),text(body.mapsUrl,300),text(body.deliveryDate,20),text(body.deliveryTime,10),text(body.deliveryType,20) || "delivery",text(body.cardMessage,800),text(body.notes,500),"Mới",paid===0?"Chưa thanh toán":paid<total?"Đã cọc":"Đã thanh toán đủ",subtotal,discount,shipping,0,total,paid,paid<total?text(body.dueDate,20):"").first<{id:number}>();
      const orderId = inserted?.id;
      if (!orderId) throw new Error("Không thể tạo đơn");
      const recipientId=await upsertRecipient(Number(customer?.id),body);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO order_items (order_id,product_id,name,sku,quantity,unit_price,discount,total,is_custom,custom_details) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId,product?.id ?? null,itemName,itemSku,quantity,itemPrice,discount,subtotal-discount,product?0:1,JSON.stringify({category:itemCategory,tone:text(body.tone,60),flowerTypes:text(body.flowerTypes,160)})),
        env.DB.prepare("INSERT INTO delivery (order_id,shipper_id,status,cod,fee,notes) VALUES (?,?,?,?,?,?)").bind(orderId,Number(body.shipperId)||4,"Chờ giao",total-paid,shipping,text(body.deliveryNotes,300)),
        env.DB.prepare("INSERT INTO production_tasks (order_id,florist_id,status,due_at,tone,flower_types,instructions) VALUES (?,?,?,?,?,?,?)").bind(orderId,Number(body.floristId)||3,"Chưa làm",`${text(body.deliveryDate,20)} ${text(body.deliveryTime,10)}:00`,text(body.tone,60),text(body.flowerTypes,160),text(body.notes,500)),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(orderId,2,"Tạo đơn",`${customerName} đặt ${itemName}`),
        env.DB.prepare("UPDATE customers SET name=?,last_order_at=?,first_order_at=CASE WHEN first_order_at='' THEN ? ELSE first_order_at END,total_orders=total_orders+1,total_spent=total_spent+?,segment=CASE WHEN total_orders>=4 THEN 'Thân thiết' WHEN total_orders>=1 THEN 'Quay lại' ELSE segment END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(customerName,text(body.deliveryDate,20),text(body.deliveryDate,20),total,customer?.id),
        ...(product ? [env.DB.prepare("UPDATE products SET sold=sold+?,revenue=revenue+? WHERE id=?").bind(quantity,subtotal-discount,product.id)] : []),
      ]);
      const shouldSaveOccasion=body.saveOccasion===true||text(body.saveOccasion,10)==="on";
      if(shouldSaveOccasion&&text(body.occasionType,60)&&text(body.occasionDate,10)){
        await saveCustomerEvent(Number(customer?.id),recipientId,body);
        await run("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)",orderId,2,"Lưu dịp đặc biệt",`${text(body.occasionType,60)} của ${recipientName}`);
      }
      if (paid > 0) await run("INSERT INTO payments (order_id,amount,method,reference,notes,staff_id) VALUES (?,?,?,?,?,?)",orderId,paid,text(body.paymentMethod,40) || "Chuyển khoản",`PAY-${Date.now()}`,"Thanh toán khi tạo đơn",2);
    } else if (action === "updateOrder") {
      const id=Number(body.id);
      const order=await env.DB.prepare("SELECT customer_id AS customerId,paid,total FROM orders WHERE id=?").bind(id).first<{customerId:number;paid:number;total:number}>();
      const oldItem=await env.DB.prepare("SELECT id,product_id AS productId,quantity,total FROM order_items WHERE order_id=? ORDER BY id LIMIT 1").bind(id).first<{id:number;productId:number|null;quantity:number;total:number}>();
      if(!order||!oldItem) return Response.json({error:"Không tìm thấy đơn hàng"},{status:404});
      const productId=Number(body.productId)||null;
      const product=productId?await env.DB.prepare("SELECT id,sku,name FROM products WHERE id=?").bind(productId).first<{id:number;sku:string;name:string}>():null;
      const itemName=text(body.itemName,160),quantity=Math.max(1,Number(body.quantity)||1),unitPrice=money(body.unitPrice);
      const shipping=money(body.shippingFee),discount=money(body.discount),subtotal=unitPrice*quantity,total=Math.max(0,subtotal-discount+shipping);
      if(!itemName||unitPrice<=0) return Response.json({error:"Tên sản phẩm và đơn giá là bắt buộc"},{status:400});
      if(total<order.paid) return Response.json({error:`Tổng mới không thể thấp hơn số tiền đã thu (${order.paid.toLocaleString("vi-VN")}đ)`},{status:400});
      const paymentStatus=order.paid===0?"Chưa thanh toán":order.paid<total?"Đã cọc":"Đã thanh toán đủ";
      const statements=[
        env.DB.prepare("UPDATE orders SET customer_name=?,customer_phone=?,source=?,recipient_name=?,recipient_phone=?,delivery_address=?,maps_url=?,delivery_date=?,delivery_time=?,delivery_type=?,card_message=?,notes=?,payment_status=?,subtotal=?,discount=?,shipping_fee=?,total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text(body.customerName,120),text(body.customerPhone,20),text(body.source,50),text(body.recipientName,120),text(body.recipientPhone,20),text(body.deliveryAddress,300),text(body.mapsUrl,300),text(body.deliveryDate,10),text(body.deliveryTime,10),text(body.deliveryType,20),text(body.cardMessage,800),text(body.notes,500),paymentStatus,subtotal,discount,shipping,total,id),
        env.DB.prepare("UPDATE order_items SET product_id=?,name=?,sku=?,quantity=?,unit_price=?,discount=?,total=?,is_custom=?,custom_details=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(product?.id??null,itemName,product?.sku||"CUSTOM",quantity,unitPrice,discount,subtotal-discount,product?0:1,JSON.stringify({category:text(body.category,80),tone:text(body.tone,60),flowerTypes:text(body.flowerTypes,160)}),oldItem.id),
        env.DB.prepare("UPDATE production_tasks SET due_at=?,tone=?,flower_types=?,instructions=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(`${text(body.deliveryDate,10)} ${text(body.deliveryTime,10)}:00`,text(body.tone,60),text(body.flowerTypes,160),text(body.notes,500),id),
        env.DB.prepare("UPDATE delivery SET fee=?,cod=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(shipping,total-order.paid,text(body.deliveryNotes,300),id),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(id,1,"Chỉnh sửa đơn",`Cập nhật thông tin đơn ${id}`),
        env.DB.prepare("UPDATE customers SET total_spent=MAX(0,total_spent-?+?),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(order.total,total,order.customerId),
      ];
      if(oldItem.productId) statements.push(env.DB.prepare("UPDATE products SET sold=MAX(0,sold-?),revenue=MAX(0,revenue-?) WHERE id=?").bind(oldItem.quantity,oldItem.total,oldItem.productId));
      if(product) statements.push(env.DB.prepare("UPDATE products SET sold=sold+?,revenue=revenue+? WHERE id=?").bind(quantity,subtotal-discount,product.id));
      await env.DB.batch(statements);
      await upsertRecipient(order.customerId,body);
    } else if (action === "deleteOrder") {
      const id=Number(body.id);
      const order=await env.DB.prepare("SELECT customer_id AS customerId,total FROM orders WHERE id=?").bind(id).first<{customerId:number;total:number}>();
      const item=await env.DB.prepare("SELECT product_id AS productId,quantity,total FROM order_items WHERE order_id=? ORDER BY id LIMIT 1").bind(id).first<{productId:number|null;quantity:number;total:number}>();
      if(!order) return Response.json({error:"Không tìm thấy đơn hàng"},{status:404});
      const statements=[
        env.DB.prepare("UPDATE customers SET total_orders=MAX(0,total_orders-1),total_spent=MAX(0,total_spent-?),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(order.total,order.customerId),
        env.DB.prepare("DELETE FROM invoices WHERE order_id=?").bind(id),env.DB.prepare("DELETE FROM payments WHERE order_id=?").bind(id),env.DB.prepare("DELETE FROM delivery WHERE order_id=?").bind(id),env.DB.prepare("DELETE FROM production_tasks WHERE order_id=?").bind(id),env.DB.prepare("DELETE FROM activity_logs WHERE order_id=?").bind(id),env.DB.prepare("DELETE FROM order_items WHERE order_id=?").bind(id),env.DB.prepare("DELETE FROM orders WHERE id=?").bind(id),
      ];
      if(item?.productId) statements.unshift(env.DB.prepare("UPDATE products SET sold=MAX(0,sold-?),revenue=MAX(0,revenue-?) WHERE id=?").bind(item.quantity,item.total,item.productId));
      await env.DB.batch(statements);
    } else if (action === "updateOrderStatus") {
      const id = Number(body.id), status = text(body.status,50);
      if(status==="Hoàn thành"){
        const readiness=await env.DB.prepare("SELECT o.total,o.paid,d.status AS deliveryStatus FROM orders o LEFT JOIN delivery d ON d.order_id=o.id WHERE o.id=?").bind(id).first<{total:number;paid:number;deliveryStatus:string}>();
        if(!readiness) throw new Error("Không tìm thấy đơn hàng");
        if(readiness.deliveryStatus!=="Đã giao"||readiness.paid<readiness.total) return Response.json({error:"Chỉ hoàn thành khi đơn đã giao và đã thu đủ tiền"},{status:409});
      }
      const statements = [
        env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(id,1,"Cập nhật trạng thái",`Chuyển đơn sang ${status}`),
      ];
      const productionStatus:Record<string,string>={"Mới":"Chưa làm","Đã xác nhận":"Chưa làm","Đã cọc":"Chưa làm","Đang chuẩn bị":"Đang làm","Chờ kiểm tra":"Chờ kiểm tra","Chờ giao":"Chờ kiểm tra","Đang giao":"Chờ kiểm tra","Đã hoàn thiện":"Đã hoàn thiện","Hoàn thành":"Đã hoàn thiện"};
      const deliveryStatus:Record<string,string>={"Chờ giao":"Chờ giao","Đang giao":"Đang giao","Đã hoàn thiện":"Đã giao","Hoàn thành":"Đã giao"};
      if(productionStatus[status]) statements.push(env.DB.prepare("UPDATE production_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(productionStatus[status],id));
      if(deliveryStatus[status]) statements.push(env.DB.prepare("UPDATE delivery SET status=?,delivered_at=CASE WHEN ?='Đã giao' THEN CURRENT_TIMESTAMP ELSE delivered_at END,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(deliveryStatus[status],deliveryStatus[status],id));
      await env.DB.batch(statements);
    } else if (action === "addPayment") {
      const orderId = Number(body.orderId), amount = money(body.amount);
      const order = await env.DB.prepare("SELECT o.total,o.paid,d.status AS deliveryStatus FROM orders o LEFT JOIN delivery d ON d.order_id=o.id WHERE o.id=?").bind(orderId).first<{total:number;paid:number;deliveryStatus:string}>();
      if (!order || amount <= 0 || amount > order.total-order.paid) return Response.json({ error: "Số tiền thanh toán không hợp lệ" }, { status: 400 });
      const newPaid = order.paid+amount;
      const completed=newPaid>=order.total&&order.deliveryStatus==="Đã giao";
      await env.DB.batch([
        env.DB.prepare("INSERT INTO payments (order_id,amount,method,reference,notes,staff_id) VALUES (?,?,?,?,?,?)").bind(orderId,amount,text(body.method,40),text(body.reference,80),text(body.notes,300),1),
        env.DB.prepare("UPDATE orders SET paid=?,payment_status=?,status=CASE WHEN ?=1 THEN 'Hoàn thành' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(newPaid,newPaid>=order.total?"Đã thanh toán đủ":"Đã cọc",completed?1:0,orderId),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(orderId,1,"Ghi nhận thanh toán",`${amount.toLocaleString("vi-VN")}đ qua ${text(body.method,40)}${completed?" · đơn đã hoàn thành":""}`),
      ]);
    } else if (action === "createInvoice") {
      const orderId = Number(body.orderId); const order = await env.DB.prepare("SELECT customer_name AS customerName,total FROM orders WHERE id=?").bind(orderId).first<{customerName:string;total:number}>();
      if (!order) throw new Error("Không tìm thấy đơn hàng");
      const exists = await env.DB.prepare("SELECT id FROM invoices WHERE order_id=?").bind(orderId).first();
      if (!exists) { const next = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM invoices").first<{next:number}>(); await run("INSERT INTO invoices (number,order_id,customer_name,total) VALUES (?,?,?,?)",`INV-2608-${String(next?.next ?? 1).padStart(4,"0")}`,orderId,order.customerName,order.total); }
    } else if (action === "updateProductionStatus") {
      const id=Number(body.id),requestedStatus=text(body.status,50),status=requestedStatus==="Đã hoàn thiện"?"Chờ kiểm tra":requestedStatus;
      if(!["Chưa làm","Đang làm","Chờ kiểm tra"].includes(status)) return Response.json({error:"Trạng thái cắm hoa không hợp lệ"},{status:400});
      const task=await env.DB.prepare("SELECT order_id AS orderId FROM production_tasks WHERE id=?").bind(id).first<{orderId:number}>();
      if(!task) throw new Error("Không tìm thấy công việc của đơn");
      const orderStatus:Record<string,string>={"Chưa làm":"Đã xác nhận","Đang làm":"Đang chuẩn bị","Chờ kiểm tra":"Chờ kiểm tra"};
      await env.DB.batch([
        env.DB.prepare("UPDATE production_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id),
        env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderStatus[status]||"Đang chuẩn bị",task.orderId),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(task.orderId,1,"Cập nhật thực hiện",`Cắm hoa: ${status}`),
      ]);
    } else if (action === "updateProductionAssignment") {
      const id=Number(body.id),staffId=Number(body.staffId);
      await run("UPDATE production_tasks SET florist_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",staffId,id);
      const task=await env.DB.prepare("SELECT order_id AS orderId FROM production_tasks WHERE id=?").bind(id).first<{orderId:number}>();
      if(task) await run("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)",task.orderId,1,"Phân công người làm",`Nhân viên #${staffId}`);
    } else if (action === "updateDeliveryStatus") {
      const id=Number(body.id),status=text(body.status,50);
      const task=await env.DB.prepare("SELECT d.order_id AS orderId,o.total,o.paid FROM delivery d JOIN orders o ON o.id=d.order_id WHERE d.id=?").bind(id).first<{orderId:number;total:number;paid:number}>();
      if(!task) throw new Error("Không tìm thấy vận đơn");
      const orderStatus:Record<string,string>={"Chờ giao":"Chờ giao","Đã lấy hàng":"Đang giao","Đang giao":"Đang giao","Đã giao":task.paid>=task.total?"Hoàn thành":"Đã hoàn thiện","Giao thất bại":"Chờ giao"};
      await env.DB.batch([
        env.DB.prepare("UPDATE delivery SET status=?,delivered_at=CASE WHEN ?='Đã giao' THEN CURRENT_TIMESTAMP ELSE delivered_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,status,id),
        env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderStatus[status]||"Chờ giao",task.orderId),
        env.DB.prepare("UPDATE production_tasks SET status=CASE WHEN ?='Đã giao' THEN 'Đã hoàn thiện' WHEN status='Đã hoàn thiện' THEN 'Chờ kiểm tra' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(status,task.orderId),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(task.orderId,1,"Cập nhật vận chuyển",`Vận đơn: ${status}`),
      ]);
    } else if (action === "updateDeliveryAssignment") {
      const id=Number(body.id),staffId=Number(body.staffId);
      await run("UPDATE delivery SET shipper_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",staffId,id);
      const task=await env.DB.prepare("SELECT order_id AS orderId FROM delivery WHERE id=?").bind(id).first<{orderId:number}>();
      if(task) await run("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)",task.orderId,1,"Phân công người giao",`Nhân viên #${staffId}`);
    } else if (action === "saveSettings") {
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind("shop",JSON.stringify(body.shop ?? {})),
        env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind("invoice",JSON.stringify(body.invoice ?? {})),
        env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind("workflow",JSON.stringify(body.workflow ?? {})),
        env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind("notifications",JSON.stringify(body.notifications ?? {})),
      ]);
    } else return Response.json({ error: "Thao tác không được hỗ trợ" }, { status: 400 });

    return Response.json(await loadStore());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu dữ liệu";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message.includes("UNIQUE") ? "Dữ liệu đã tồn tại (kiểm tra SĐT hoặc SKU)" : message }, { status });
  }
}
