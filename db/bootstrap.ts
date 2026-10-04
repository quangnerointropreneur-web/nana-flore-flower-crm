import { env } from "cloudflare:workers";
import { hashPassword } from "./auth";
import { buildSeedStore } from "../app/firebase/seed";

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
  const settings=buildSeedStore().settings;
  await db.batch(Object.entries(settings).map(([key,value])=>db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").bind(key,JSON.stringify(value))));
  await ensureDefaultAccount();
  await db.prepare("PRAGMA optimize").run();
}

export async function all<T extends D1ResultRow = D1ResultRow>(sql: string, ...bindings: unknown[]) {
  return (await env.DB.prepare(sql).bind(...bindings).all<T>()).results;
}

export async function run(sql: string, ...bindings: unknown[]) {
  return env.DB.prepare(sql).bind(...bindings).run();
}
