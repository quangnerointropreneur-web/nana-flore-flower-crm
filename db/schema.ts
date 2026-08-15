import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const staff = sqliteTable("staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").default(""),
  role: text("role").notNull().default("sales"),
  avatar: text("avatar").default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const authAccounts = sqliteTable("auth_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().unique().references(() => staff.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  lastLoginAt: text("last_login_at").default(""),
  ...timestamps,
});

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_auth_sessions_expiry").on(table.expiresAt)]);

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("individual"),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email").default(""),
  zalo: text("zalo").default(""),
  facebook: text("facebook").default(""),
  birthday: text("birthday").default(""),
  gender: text("gender").default(""),
  address: text("address").default(""),
  source: text("source").notNull().default("Facebook"),
  staffId: integer("staff_id").references(() => staff.id),
  company: text("company").default(""),
  taxCode: text("tax_code").default(""),
  segment: text("segment").notNull().default("Mới"),
  tags: text("tags").notNull().default("[]"),
  notes: text("notes").default(""),
  firstOrderAt: text("first_order_at").default(""),
  lastOrderAt: text("last_order_at").default(""),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  ...timestamps,
});

export const customerRecipients = sqliteTable("customer_recipients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").default(""),
  address: text("address").default(""),
  relationship: text("relationship").default(""),
  birthday: text("birthday").default(""),
  anniversary: text("anniversary").default(""),
  notes: text("notes").default(""),
  ...timestamps,
}, (table) => [index("idx_customer_recipients_customer_id").on(table.customerId)]);

export const customerEvents = sqliteTable("customer_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").references(() => customerRecipients.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  eventDate: text("event_date").notNull(),
  remindDays: text("remind_days").notNull().default("[30,14,7,3,1]"),
  notes: text("notes").default(""),
  ...timestamps,
}, (table) => [index("idx_customer_events_customer_date").on(table.customerId, table.eventDate)]);

export const productCategories = sqliteTable("product_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  cost: integer("cost").notNull().default(0),
  image: text("image").default(""),
  status: text("status").notNull().default("active"),
  sold: integer("sold").notNull().default(0),
  revenue: integer("revenue").notNull().default(0),
  ...timestamps,
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  source: text("source").notNull().default("Facebook"),
  staffId: integer("staff_id").references(() => staff.id),
  recipientName: text("recipient_name").notNull(),
  recipientPhone: text("recipient_phone").default(""),
  deliveryAddress: text("delivery_address").default(""),
  mapsUrl: text("maps_url").default(""),
  deliveryDate: text("delivery_date").notNull(),
  deliveryTime: text("delivery_time").notNull(),
  deliveryType: text("delivery_type").notNull().default("delivery"),
  cardMessage: text("card_message").default(""),
  notes: text("notes").default(""),
  status: text("status").notNull().default("Mới"),
  paymentStatus: text("payment_status").notNull().default("Chưa thanh toán"),
  subtotal: integer("subtotal").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  shippingFee: integer("shipping_fee").notNull().default(0),
  surcharge: integer("surcharge").notNull().default(0),
  total: integer("total").notNull().default(0),
  paid: integer("paid").notNull().default(0),
  dueDate: text("due_date").default(""),
  ...timestamps,
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id),
  name: text("name").notNull(),
  sku: text("sku").default(""),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  discount: integer("discount").notNull().default(0),
  total: integer("total").notNull(),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  customDetails: text("custom_details").notNull().default("{}"),
  ...timestamps,
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  reference: text("reference").default(""),
  notes: text("notes").default(""),
  paidAt: text("paid_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  staffId: integer("staff_id").references(() => staff.id),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  total: integer("total").notNull(),
  status: text("status").notNull().default("Đã phát hành"),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const delivery = sqliteTable("delivery", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  shipperId: integer("shipper_id").references(() => staff.id),
  status: text("status").notNull().default("Chờ giao"),
  cod: integer("cod").notNull().default(0),
  fee: integer("fee").notNull().default(0),
  notes: text("notes").default(""),
  pickedUpAt: text("picked_up_at").default(""),
  deliveredAt: text("delivered_at").default(""),
  ...timestamps,
});

export const productionTasks = sqliteTable("production_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  floristId: integer("florist_id").references(() => staff.id),
  status: text("status").notNull().default("Chưa làm"),
  dueAt: text("due_at").notNull(),
  tone: text("tone").default(""),
  flowerTypes: text("flower_types").default(""),
  instructions: text("instructions").default(""),
  referenceImage: text("reference_image").default(""),
  completedImage: text("completed_image").default(""),
  ...timestamps,
});

export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staff.id),
  action: text("action").notNull(),
  details: text("details").default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  creator: one(staff, { fields: [orders.staffId], references: [staff.id] }),
  items: many(orderItems), payments: many(payments), invoices: many(invoices), logs: many(activityLogs),
}));
export const customerRelations = relations(customers, ({ many, one }) => ({
  orders: many(orders), recipients: many(customerRecipients), events: many(customerEvents),
  owner: one(staff, { fields: [customers.staffId], references: [staff.id] }),
}));
export const itemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
