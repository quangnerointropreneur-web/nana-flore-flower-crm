import { env } from "cloudflare:workers";
import { all, ensureDatabase, run } from "../../../db/bootstrap";

export const dynamic = "force-dynamic";

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const money = (value: unknown) => Math.max(0, Math.round(Number(value) || 0));

async function loadStore() {
  await ensureDatabase();
  const [customers, products, orders, payments, invoices, staff, production, deliveries, logs, settingRows] = await Promise.all([
    all(`SELECT c.id,c.code,c.type,c.name,c.phone,c.email,c.address,c.source,c.company,c.tax_code AS taxCode,c.segment,c.tags,c.notes,c.first_order_at AS firstOrderAt,c.last_order_at AS lastOrderAt,c.total_orders AS totalOrders,c.total_spent AS totalSpent,c.created_at AS createdAt,s.name AS staffName FROM customers c LEFT JOIN staff s ON s.id=c.staff_id ORDER BY c.total_spent DESC,c.id DESC`),
    all(`SELECT id,sku,name,category,price,cost,image,status,sold,revenue,created_at AS createdAt FROM products ORDER BY id DESC`),
    all(`SELECT o.id,o.code,o.customer_id AS customerId,o.customer_name AS customerName,o.customer_phone AS customerPhone,o.source,o.recipient_name AS recipientName,o.recipient_phone AS recipientPhone,o.delivery_address AS deliveryAddress,o.maps_url AS mapsUrl,o.delivery_date AS deliveryDate,o.delivery_time AS deliveryTime,o.delivery_type AS deliveryType,o.card_message AS cardMessage,o.notes,o.status,o.payment_status AS paymentStatus,o.subtotal,o.discount,o.shipping_fee AS shippingFee,o.surcharge,o.total,o.paid,(o.total-o.paid) AS remaining,o.due_date AS dueDate,o.created_at AS createdAt,s.name AS staffName,oi.name AS itemName,oi.sku AS itemSku,oi.quantity,oi.unit_price AS unitPrice FROM orders o LEFT JOIN staff s ON s.id=o.staff_id LEFT JOIN order_items oi ON oi.id=(SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id=o.id) ORDER BY o.delivery_date ASC,o.delivery_time ASC,o.id DESC`),
    all(`SELECT p.id,p.order_id AS orderId,o.code AS orderCode,o.customer_name AS customerName,p.amount,p.method,p.reference,p.notes,p.paid_at AS paidAt,s.name AS staffName FROM payments p JOIN orders o ON o.id=p.order_id LEFT JOIN staff s ON s.id=p.staff_id ORDER BY p.paid_at DESC,p.id DESC`),
    all(`SELECT i.id,i.number,i.order_id AS orderId,o.code AS orderCode,i.customer_name AS customerName,i.total,i.status,i.issued_at AS issuedAt,o.customer_phone AS customerPhone,o.delivery_address AS customerAddress,o.subtotal,o.discount,o.shipping_fee AS shippingFee,o.surcharge,o.paid,(o.total-o.paid) AS remaining,o.payment_status AS paymentStatus,oi.name AS itemName,oi.quantity,oi.unit_price AS unitPrice FROM invoices i JOIN orders o ON o.id=i.order_id LEFT JOIN order_items oi ON oi.id=(SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id=o.id) ORDER BY i.issued_at DESC`),
    all(`SELECT id,name,email,phone,role,avatar,active,created_at AS createdAt FROM staff ORDER BY id`),
    all(`SELECT p.id,p.order_id AS orderId,o.code AS orderCode,o.customer_name AS customerName,o.delivery_date AS deliveryDate,o.delivery_time AS deliveryTime,o.card_message AS cardMessage,p.status,p.due_at AS dueAt,p.tone,p.flower_types AS flowerTypes,p.instructions,p.reference_image AS referenceImage,p.completed_image AS completedImage,s.name AS floristName,oi.name AS itemName FROM production_tasks p JOIN orders o ON o.id=p.order_id LEFT JOIN staff s ON s.id=p.florist_id LEFT JOIN order_items oi ON oi.id=(SELECT MIN(i2.id) FROM order_items i2 WHERE i2.order_id=o.id) ORDER BY p.due_at`),
    all(`SELECT d.id,d.order_id AS orderId,o.code AS orderCode,o.recipient_name AS recipientName,o.recipient_phone AS recipientPhone,o.delivery_address AS deliveryAddress,o.maps_url AS mapsUrl,o.delivery_date AS deliveryDate,o.delivery_time AS deliveryTime,d.status,d.cod,d.fee,d.notes,s.name AS shipperName FROM delivery d JOIN orders o ON o.id=d.order_id LEFT JOIN staff s ON s.id=d.shipper_id ORDER BY o.delivery_date,o.delivery_time`),
    all(`SELECT l.id,l.order_id AS orderId,l.action,l.details,l.created_at AS createdAt,s.name AS staffName FROM activity_logs l LEFT JOIN staff s ON s.id=l.staff_id ORDER BY l.created_at DESC,l.id DESC LIMIT 100`),
    all<{key:string;value:string}>(`SELECT key,value FROM settings`),
  ]);
  const settings = Object.fromEntries(settingRows.map((row: { key: string; value: string }) => {
    try { return [row.key, JSON.parse(row.value)]; } catch { return [row.key, row.value]; }
  }));
  return { customers, products, orders, payments, invoices, staff, production, deliveries, logs, settings };
}

export async function GET() {
  try { return Response.json(await loadStore()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tải dữ liệu" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
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
    } else if (action === "createProduct") {
      const name = text(body.name,160), sku = text(body.sku,40); if (!name || !sku) throw new Error("Tên và SKU là bắt buộc");
      await run("INSERT INTO products (sku,name,category,price,cost,image,status) VALUES (?,?,?,?,?,?,?)", sku,name,text(body.category,60),money(body.price),money(body.cost),text(body.image,50) || "💐",text(body.status,30) || "active");
    } else if (action === "updateProduct") {
      await run("UPDATE products SET sku=?,name=?,category=?,price=?,cost=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",text(body.sku,40),text(body.name,160),text(body.category,60),money(body.price),money(body.cost),text(body.status,30),Number(body.id));
    } else if (action === "deleteProduct") {
      const id = Number(body.id); const used = await env.DB.prepare("SELECT COUNT(*) AS count FROM order_items WHERE product_id=?").bind(id).first<{count:number}>();
      if ((used?.count ?? 0) > 0) return Response.json({ error: "Sản phẩm đã phát sinh đơn; hãy chuyển sang Ẩn" }, { status: 409 });
      await run("DELETE FROM products WHERE id=?", id);
    } else if (action === "createOrder") {
      const customerName = text(body.customerName,120), customerPhone = text(body.customerPhone,20), recipientName = text(body.recipientName,120);
      const productId = Number(body.productId), quantity = Math.max(1, Number(body.quantity) || 1);
      const product = await env.DB.prepare("SELECT id,sku,name,price FROM products WHERE id=?").bind(productId).first<{id:number;sku:string;name:string;price:number}>();
      if (!customerName || !customerPhone || !recipientName || !product) return Response.json({ error: "Vui lòng hoàn tất khách, người nhận và sản phẩm" }, { status: 400 });
      let customer = await env.DB.prepare("SELECT id FROM customers WHERE phone=?").bind(customerPhone).first<{id:number}>();
      if (!customer) {
        const next = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM customers").first<{next:number}>();
        customer = await env.DB.prepare("INSERT INTO customers (code,name,phone,source,staff_id,segment,tags) VALUES (?,?,?,?,?,?,?) RETURNING id").bind(`CUS-${String(next?.next ?? 1).padStart(4,"0")}`,customerName,customerPhone,text(body.source,50) || "Facebook",2,"Mới","[]").first<{id:number}>();
      }
      const shipping = money(body.shippingFee), discount = money(body.discount), subtotal = product.price * quantity, total = Math.max(0,subtotal-discount+shipping), paid = Math.min(total,money(body.paid));
      const nextOrder = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM orders").first<{next:number}>();
      const code = `FH-260815-${String(nextOrder?.next ?? 1).padStart(3,"0")}`;
      const inserted = await env.DB.prepare("INSERT INTO orders (code,customer_id,customer_name,customer_phone,source,staff_id,recipient_name,recipient_phone,delivery_address,maps_url,delivery_date,delivery_time,delivery_type,card_message,notes,status,payment_status,subtotal,discount,shipping_fee,surcharge,total,paid,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id").bind(code,customer?.id,customerName,customerPhone,text(body.source,50) || "Facebook",2,recipientName,text(body.recipientPhone,20),text(body.deliveryAddress,300),text(body.mapsUrl,300),text(body.deliveryDate,20),text(body.deliveryTime,10),text(body.deliveryType,20) || "delivery",text(body.cardMessage,800),text(body.notes,500),"Mới",paid===0?"Chưa thanh toán":paid<total?"Đã cọc":"Đã thanh toán đủ",subtotal,discount,shipping,0,total,paid,paid<total?text(body.dueDate,20):"").first<{id:number}>();
      const orderId = inserted?.id;
      if (!orderId) throw new Error("Không thể tạo đơn");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO order_items (order_id,product_id,name,sku,quantity,unit_price,discount,total,is_custom,custom_details) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId,product.id,product.name,product.sku,quantity,product.price,discount,subtotal-discount,0,"{}"),
        env.DB.prepare("INSERT INTO delivery (order_id,shipper_id,status,cod,fee,notes) VALUES (?,?,?,?,?,?)").bind(orderId,4,"Chờ giao",total-paid,shipping,text(body.deliveryNotes,300)),
        env.DB.prepare("INSERT INTO production_tasks (order_id,florist_id,status,due_at,tone,flower_types,instructions) VALUES (?,?,?,?,?,?,?)").bind(orderId,3,"Chưa làm",`${text(body.deliveryDate,20)} ${text(body.deliveryTime,10)}:00`,text(body.tone,60),text(body.flowerTypes,160),text(body.notes,500)),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(orderId,2,"Tạo đơn",`${customerName} đặt ${product.name}`),
        env.DB.prepare("UPDATE customers SET name=?,last_order_at=?,first_order_at=CASE WHEN first_order_at='' THEN ? ELSE first_order_at END,total_orders=total_orders+1,total_spent=total_spent+?,segment=CASE WHEN total_orders>=4 THEN 'Thân thiết' WHEN total_orders>=1 THEN 'Quay lại' ELSE segment END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(customerName,text(body.deliveryDate,20),text(body.deliveryDate,20),total,customer?.id),
        env.DB.prepare("UPDATE products SET sold=sold+?,revenue=revenue+? WHERE id=?").bind(quantity,subtotal-discount,product.id),
      ]);
      if (paid > 0) await run("INSERT INTO payments (order_id,amount,method,reference,notes,staff_id) VALUES (?,?,?,?,?,?)",orderId,paid,text(body.paymentMethod,40) || "Chuyển khoản",`PAY-${Date.now()}`,"Thanh toán khi tạo đơn",2);
    } else if (action === "updateOrderStatus") {
      const id = Number(body.id), status = text(body.status,50);
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(id,1,"Cập nhật trạng thái",`Chuyển đơn sang ${status}`),
      ]);
    } else if (action === "addPayment") {
      const orderId = Number(body.orderId), amount = money(body.amount);
      const order = await env.DB.prepare("SELECT total,paid FROM orders WHERE id=?").bind(orderId).first<{total:number;paid:number}>();
      if (!order || amount <= 0 || amount > order.total-order.paid) return Response.json({ error: "Số tiền thanh toán không hợp lệ" }, { status: 400 });
      const newPaid = order.paid+amount;
      await env.DB.batch([
        env.DB.prepare("INSERT INTO payments (order_id,amount,method,reference,notes,staff_id) VALUES (?,?,?,?,?,?)").bind(orderId,amount,text(body.method,40),text(body.reference,80),text(body.notes,300),1),
        env.DB.prepare("UPDATE orders SET paid=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(newPaid,newPaid>=order.total?"Đã thanh toán đủ":"Thanh toán một phần",orderId),
        env.DB.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(orderId,1,"Ghi nhận thanh toán",`${amount.toLocaleString("vi-VN")}đ qua ${text(body.method,40)}`),
      ]);
    } else if (action === "createInvoice") {
      const orderId = Number(body.orderId); const order = await env.DB.prepare("SELECT customer_name AS customerName,total FROM orders WHERE id=?").bind(orderId).first<{customerName:string;total:number}>();
      if (!order) throw new Error("Không tìm thấy đơn hàng");
      const exists = await env.DB.prepare("SELECT id FROM invoices WHERE order_id=?").bind(orderId).first();
      if (!exists) { const next = await env.DB.prepare("SELECT COALESCE(MAX(id),0)+1 AS next FROM invoices").first<{next:number}>(); await run("INSERT INTO invoices (number,order_id,customer_name,total) VALUES (?,?,?,?)",`INV-2608-${String(next?.next ?? 1).padStart(4,"0")}`,orderId,order.customerName,order.total); }
    } else if (action === "updateProductionStatus") {
      await run("UPDATE production_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",text(body.status,50),Number(body.id));
    } else if (action === "updateDeliveryStatus") {
      await run("UPDATE delivery SET status=?,delivered_at=CASE WHEN ?='Đã giao' THEN CURRENT_TIMESTAMP ELSE delivered_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?",text(body.status,50),text(body.status,50),Number(body.id));
    } else if (action === "saveSettings") {
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind("shop",JSON.stringify(body.shop ?? {})),
        env.DB.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)").bind("invoice",JSON.stringify(body.invoice ?? {})),
      ]);
    } else return Response.json({ error: "Thao tác không được hỗ trợ" }, { status: 400 });

    return Response.json(await loadStore());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể lưu dữ liệu";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message.includes("UNIQUE") ? "Dữ liệu đã tồn tại (kiểm tra SĐT hoặc SKU)" : message }, { status });
  }
}
