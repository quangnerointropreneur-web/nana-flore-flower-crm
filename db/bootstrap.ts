import { env } from "cloudflare:workers";
import { hashPassword } from "./auth";

type D1ResultRow = Record<string, unknown>;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'sales', avatar TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS auth_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL UNIQUE REFERENCES staff(id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, last_login_at TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'individual', name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, email TEXT DEFAULT '', zalo TEXT DEFAULT '', facebook TEXT DEFAULT '', birthday TEXT DEFAULT '', gender TEXT DEFAULT '', address TEXT DEFAULT '', source TEXT NOT NULL DEFAULT 'Facebook', staff_id INTEGER REFERENCES staff(id), company TEXT DEFAULT '', tax_code TEXT DEFAULT '', segment TEXT NOT NULL DEFAULT 'Mới', tags TEXT NOT NULL DEFAULT '[]', notes TEXT DEFAULT '', first_order_at TEXT DEFAULT '', last_order_at TEXT DEFAULT '', total_orders INTEGER NOT NULL DEFAULT 0, total_spent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customer_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '', relationship TEXT DEFAULT '', birthday TEXT DEFAULT '', anniversary TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS customer_events (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE, recipient_id INTEGER REFERENCES customer_recipients(id) ON DELETE SET NULL, type TEXT NOT NULL, title TEXT NOT NULL, event_date TEXT NOT NULL, remind_days TEXT NOT NULL DEFAULT '[30,14,7,3,1]', notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL, cost INTEGER NOT NULL DEFAULT 0, image TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active', sold INTEGER NOT NULL DEFAULT 0, revenue INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, customer_id INTEGER REFERENCES customers(id), customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Facebook', staff_id INTEGER REFERENCES staff(id), recipient_name TEXT NOT NULL, recipient_phone TEXT DEFAULT '', delivery_address TEXT DEFAULT '', maps_url TEXT DEFAULT '', delivery_date TEXT NOT NULL, delivery_time TEXT NOT NULL, delivery_type TEXT NOT NULL DEFAULT 'delivery', card_message TEXT DEFAULT '', notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Mới', payment_status TEXT NOT NULL DEFAULT 'Chưa thanh toán', subtotal INTEGER NOT NULL DEFAULT 0, discount INTEGER NOT NULL DEFAULT 0, shipping_fee INTEGER NOT NULL DEFAULT 0, surcharge INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0, due_date TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id), name TEXT NOT NULL, sku TEXT DEFAULT '', quantity INTEGER NOT NULL DEFAULT 1, unit_price INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0, custom_details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, amount INTEGER NOT NULL, method TEXT NOT NULL, reference TEXT DEFAULT '', notes TEXT DEFAULT '', paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, staff_id INTEGER REFERENCES staff(id))`,
  `CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT NOT NULL UNIQUE, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, customer_name TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Đã phát hành', issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS delivery (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, shipper_id INTEGER REFERENCES staff(id), status TEXT NOT NULL DEFAULT 'Chờ giao', cod INTEGER NOT NULL DEFAULT 0, fee INTEGER NOT NULL DEFAULT 0, notes TEXT DEFAULT '', picked_up_at TEXT DEFAULT '', delivered_at TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS production_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE, florist_id INTEGER REFERENCES staff(id), status TEXT NOT NULL DEFAULT 'Chưa làm', due_at TEXT NOT NULL, tone TEXT DEFAULT '', flower_types TEXT DEFAULT '', instructions TEXT DEFAULT '', reference_image TEXT DEFAULT '', completed_image TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, staff_id INTEGER REFERENCES staff(id), action TEXT NOT NULL, details TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, delivery_date)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_recipients_customer_id ON customer_recipients(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_events_customer_date ON customer_events(customer_id, event_date)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)`,
];

const names = ["Nguyễn Minh Anh","Trần Hoàng Nam","Lê Thu Hà","Phạm Gia Hân","Đỗ Nhật Minh","Vũ Thanh Tú","Bùi Bảo Ngọc","Hoàng Đức Anh","Nguyễn Quỳnh Chi","Lâm Ngọc Mai","Công ty An Nhiên","Studio Nắng","Trương Quốc Bảo","Lý Phương Linh","Hồ Hải Yến","Đặng Khánh Vy","Mai Tuấn Kiệt","Phan Thảo My","Công ty Mây Việt","Ngô Minh Khang"];
const productSeed = [
  ["BH-001","Bó hồng Pastel","Bó hoa",850000,470000,"🌸"],["GH-002","Giỏ hoa Nắng Mai","Giỏ hoa",1250000,680000,"🌻"],["HH-003","Hộp hoa Mộng Mơ","Hộp hoa",980000,520000,"🌷"],["KT-004","Kệ hoa Khai Trương","Hoa khai trương",2200000,1350000,"🌺"],["SN-005","Bó tulip Sinh Nhật","Hoa sinh nhật",1150000,650000,"💐"],["CB-006","Vòng hoa Chia Buồn","Hoa chia buồn",1800000,1100000,"🤍"],["HQ-007","Set hoa & Chocolate","Set hoa + quà",1450000,820000,"🎁"],["CH-008","Bó cẩm chướng Dịu Dàng","Bó hoa",720000,390000,"🌷"],["CU-009","Hoa cưới Trắng Tinh","Hoa cưới",1600000,920000,"🤍"],["TC-010","Giỏ trái cây Premium","Trái cây",1350000,880000,"🍎"],["QT-011","Gấu bông Teddy","Quà tặng",350000,190000,"🧸"],["TH-012","Thiệp viết tay","Thiệp",50000,12000,"💌"],["PK-013","Bóng bay trang trí","Phụ kiện",120000,45000,"🎈"],["HO-014","Bó hướng dương Rực Rỡ","Bó hoa",780000,420000,"🌻"],["LY-015","Bó lily Thanh Nhã","Bó hoa",1050000,580000,"🪷"],
] as const;
const statuses = ["Mới","Đã xác nhận","Đã cọc","Đang chuẩn bị","Đã hoàn thiện","Chờ giao","Đang giao","Đã giao","Hoàn thành"];
const sources = ["Facebook","Instagram","Zalo","Website","TikTok","Khách tại cửa hàng"];

async function ensureDefaultAccount(){
  const exists=await env.DB.prepare("SELECT id FROM auth_accounts LIMIT 1").first();
  if(exists)return;
  const manager=await env.DB.prepare("SELECT id,email FROM staff WHERE role='manager' AND active=1 ORDER BY id LIMIT 1").first<{id:number;email:string}>();
  if(!manager)return;
  const initialPassword=env.INITIAL_ADMIN_PASSWORD?.trim();
  if(!initialPassword)throw new Error("Chưa cấu hình mật khẩu quản trị ban đầu");
  const credentials=await hashPassword(initialPassword);
  await env.DB.prepare("INSERT INTO auth_accounts (staff_id,email,password_hash,password_salt) VALUES (?,?,?,?)").bind(manager.id,manager.email.toLowerCase(),credentials.hash,credentials.salt).run();
}

export async function ensureDatabase() {
  const db = env.DB;
  if (!db) throw new Error("D1 binding DB is unavailable");
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  const count = await db.prepare("SELECT COUNT(*) AS count FROM customers").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) { await ensureDefaultAccount(); await db.prepare("PRAGMA optimize").run(); return; }

  await db.batch([
    ["Ngọc Lan","lan@flore.vn","0909000101","manager"],["Nero Nguyễn","nero@flore.vn","0909000102","sales"],["Mai Hoa","hoa@flore.vn","0909000103","florist"],["Đức Long","long@flore.vn","0909000104","delivery"],["Thảo Vy","vy@flore.vn","0909000105","accountant"],
  ].map((s) => db.prepare("INSERT INTO staff (name,email,phone,role) VALUES (?,?,?,?)").bind(...s)));
  await ensureDefaultAccount();

  await db.batch(names.map((name, index) => db.prepare("INSERT INTO customers (code,type,name,phone,email,address,source,staff_id,company,segment,tags,first_order_at,last_order_at,total_orders,total_spent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(
    `CUS-${String(index + 1).padStart(4,"0")}`,
    name.includes("Công ty") || name.includes("Studio") ? "business" : "individual",
    name,
    `09${String(12000000 + index * 37691).slice(-8)}`,
    `khach${index + 1}@example.com`,
    `${18 + index} Đường Hoa Hồng, ${index % 3 === 0 ? "Quận 1" : index % 3 === 1 ? "Quận 3" : "Thủ Đức"}, TP.HCM`,
    sources[index % sources.length],
    (index % 2) + 1,
    name.includes("Công ty") || name.includes("Studio") ? name : "",
    index < 2 ? "VIP" : index < 7 ? "Thân thiết" : index < 14 ? "Quay lại" : "Mới",
    JSON.stringify(index < 3 ? ["Khách VIP","Hay mua > 1 triệu"] : [index % 2 ? "Hoa sinh nhật" : "Hoa kỷ niệm"]),
    "2025-09-12",
    `2026-08-${String(2 + (index % 13)).padStart(2,"0")}`,
    index < 2 ? 12 - index : 1 + (index % 7),
    index < 2 ? 18450000 - index * 3200000 : 680000 + index * 375000,
  )));

  await db.batch(productSeed.map((p, index) => db.prepare("INSERT INTO products (sku,name,category,price,cost,image,status,sold,revenue) VALUES (?,?,?,?,?,?,?,?,?)").bind(p[0],p[1],p[2],p[3],p[4],p[5], index === 11 ? "hidden" : index === 8 ? "out_of_stock" : "active", 8 + (index * 7) % 42, (8 + (index * 7) % 42) * p[3])));

  for (let index = 0; index < 30; index += 1) {
    const customerIndex = index % names.length;
    const productIndex = (index * 3) % productSeed.length;
    const product = productSeed[productIndex];
    const quantity = index % 7 === 0 ? 2 : 1;
    const subtotal = product[3] * quantity;
    const discount = index % 6 === 0 ? 100000 : 0;
    const shipping = index % 5 === 0 ? 0 : 50000 + (index % 3) * 15000;
    const total = subtotal - discount + shipping;
    const paid = index % 4 === 0 ? Math.round(total * .4) : index % 5 === 0 ? 0 : total;
    const status = statuses[index % statuses.length];
    const deliveryDay = String(15 + (index % 4)).padStart(2,"0");
    const time = `${String(9 + (index % 10)).padStart(2,"0")}:${index % 2 ? "30" : "00"}`;
    const code = `FH-260815-${String(index + 1).padStart(3,"0")}`;
    const orderInsert = await db.prepare("INSERT INTO orders (code,customer_id,customer_name,customer_phone,source,staff_id,recipient_name,recipient_phone,delivery_address,maps_url,delivery_date,delivery_time,delivery_type,card_message,notes,status,payment_status,subtotal,discount,shipping_fee,surcharge,total,paid,due_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id").bind(
      code, customerIndex + 1, names[customerIndex], `09${String(12000000 + customerIndex * 37691).slice(-8)}`, sources[index % sources.length], (index % 2) + 1,
      index % 3 === 0 ? "Chị Thu" : names[customerIndex], `09${String(45000000 + index * 18433).slice(-8)}`,
      `${42 + index} ${index % 2 ? "Nguyễn Huệ" : "Lê Lợi"}, ${index % 3 === 0 ? "Quận 1" : index % 3 === 1 ? "Quận 3" : "Thủ Đức"}, TP.HCM`,
      "https://maps.google.com", `2026-08-${deliveryDay}`, time, index % 9 === 0 ? "pickup" : "delivery",
      index % 2 ? "Chúc em một ngày thật nhiều niềm vui và hạnh phúc!" : "Happy birthday! Luôn rạng rỡ nhé.",
      index % 8 === 0 ? "Khách dặn giao nhẹ tay, gọi trước 10 phút." : "", status,
      paid === 0 ? "Chưa thanh toán" : paid < total ? "Đã cọc" : "Đã thanh toán đủ", subtotal, discount, shipping, 0, total, paid,
      paid < total ? "2026-08-20" : "", `2026-08-${String(1 + (index % 15)).padStart(2,"0")} ${String(8 + (index % 9)).padStart(2,"0")}:30:00`,
    ).first<{id:number}>();
    const orderId = orderInsert?.id ?? index + 1;
    await db.batch([
      db.prepare("INSERT INTO order_items (order_id,product_id,name,sku,quantity,unit_price,discount,total,is_custom,custom_details) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(orderId, productIndex + 1, product[1], product[0], quantity, product[3], discount, subtotal - discount, 0, "{}"),
      db.prepare("INSERT INTO delivery (order_id,shipper_id,status,cod,fee,notes) VALUES (?,?,?,?,?,?)").bind(orderId, 4, status === "Đã giao" || status === "Hoàn thành" ? "Đã giao" : status === "Đang giao" ? "Đang giao" : "Chờ giao", total - paid, shipping, "Gọi người nhận trước khi đến"),
      db.prepare("INSERT INTO production_tasks (order_id,florist_id,status,due_at,tone,flower_types,instructions) VALUES (?,?,?,?,?,?,?)").bind(orderId, 3, ["Chưa làm","Đang làm","Chờ kiểm tra","Đã hoàn thiện"][index % 4], `2026-08-${deliveryDay} ${time}:00`, ["Pastel hồng","Trắng xanh","Vàng cam","Đỏ burgundy"][index % 4], ["Hồng Ecuador","Tulip","Hướng dương","Cẩm chướng"][index % 4], "Cắm thoáng, dáng tự nhiên, nơ lụa đồng màu"),
      db.prepare("INSERT INTO activity_logs (order_id,staff_id,action,details) VALUES (?,?,?,?)").bind(orderId, 2, "Tạo đơn", `${names[customerIndex]} đặt ${product[1]}`),
    ]);
    if (paid > 0) await db.prepare("INSERT INTO payments (order_id,amount,method,reference,notes,paid_at,staff_id) VALUES (?,?,?,?,?,?,?)").bind(orderId, paid, index % 3 === 0 ? "Chuyển khoản" : index % 3 === 1 ? "QR" : "Tiền mặt", `PAY-${String(index + 1).padStart(4,"0")}`, index % 4 === 0 ? "Tiền cọc" : "Thanh toán đơn hàng", `2026-08-${String(1 + (index % 15)).padStart(2,"0")} 09:35:00`, 2).run();
    if (index < 10) await db.prepare("INSERT INTO invoices (number,order_id,customer_name,total,status,issued_at) VALUES (?,?,?,?,?,?)").bind(`INV-2608-${String(index + 1).padStart(4,"0")}`, orderId, names[customerIndex], total, "Đã phát hành", `2026-08-${String(3 + index).padStart(2,"0")} 10:00:00`).run();
  }

  await db.batch([
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("shop", JSON.stringify({ name:"Floré Flower Studio", address:"128 Nguyễn Huệ, Quận 1, TP.HCM", hotline:"0909 123 456", website:"flore.vn", facebook:"facebook.com/floreflower", bank:"Vietcombank · 0123456789 · NGUYEN NGOC LAN", footer:"Cảm ơn quý khách đã tin tưởng Floré!" })),
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("invoice", JSON.stringify({ showPhone:true, showAddress:true, showDiscount:true, showShipping:true, showQr:true })),
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("workflow", JSON.stringify({ productGroups:["Hoa bó","Hoa giỏ","Hoa hộp","Hoa bình","Giỏ quả","Giỏ quả & hoa","Hoa sự kiện","Theo yêu cầu"], defaultShippingFee:50000, defaultFloristId:3, defaultShipperId:4 })),
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind("notifications", JSON.stringify({ dueSoon:true, unpaid:true, specialOccasion:true })),
  ]);
  await db.prepare("PRAGMA optimize").run();
}

export async function all<T extends D1ResultRow = D1ResultRow>(sql: string, ...bindings: unknown[]) {
  return (await env.DB.prepare(sql).bind(...bindings).all<T>()).results;
}

export async function run(sql: string, ...bindings: unknown[]) {
  return env.DB.prepare(sql).bind(...bindings).run();
}
