import type { StoreData } from "../types";
const seededAt = "2026-08-15 08:00:00";
const sampleStaff = ["lan@flore.vn", "nero@flore.vn", "hoa@flore.vn", "long@flore.vn", "vy@flore.vn"];
const sampleProducts = ["BH-001", "GH-002", "HH-003", "KT-004", "SN-005", "CB-006", "HQ-007", "CH-008", "CU-009", "TC-010", "QT-011", "TH-012", "PK-013", "HO-014", "LY-015"];
const sampleExpenses = [
  ["2026-08-01", 4200000, "Chợ hoa Hồ Thị Kỷ"], ["2026-08-04", 1350000, "Shop bao bì An Phú"],
  ["2026-08-08", 900000, "Facebook Ads"], ["2026-08-12", 2800000, "CTV cắm hoa"],
  ["2026-08-15", 6500000, "Chủ nhà"], ["2026-08-16", 450000, "Grab giao vật tư"],
] as const;

export function demoCleanupPlan(data: StoreData) {
  const orders = new Set(data.orders.filter(o => o.id >= 1 && o.id <= 30 && o.code === `FH-260815-${String(o.id).padStart(3, "0")}` && o.createdAt.startsWith("2026-08-") && o.mapsUrl === "https://maps.google.com").map(o => o.id));
  const retainedOrders = data.orders.filter(o => !orders.has(o.id));
  const customers = new Set(data.customers.filter(c => c.createdAt === seededAt && c.id <= 20 && c.email === `khach${c.id}@example.com` && !retainedOrders.some(o => o.customerId === c.id)).map(c => c.id));
  const products = new Set(data.products.filter(p => p.createdAt === seededAt && sampleProducts[p.id - 1] === p.sku && !retainedOrders.some(o => o.itemProductId === p.id)).map(p => p.id));
  const staff = new Set(data.staff.filter(s => s.createdAt === seededAt && sampleStaff[s.id - 1] === s.email.toLowerCase()).map(s => s.id));
  const expenses = new Set(data.expenses.filter(e => { const sample = sampleExpenses[e.id - 1]; return sample && e.date === sample[0] && e.amount === sample[1] && e.vendor === sample[2] && e.createdAt === `${e.date} 09:00:00`; }).map(e => e.id));
  return {
    customers, products, staff, orders, expenses,
    recipients: new Set(data.recipients.filter(r => r.createdAt === seededAt && customers.has(r.customerId)).map(r => r.id)),
    events: new Set(data.events.filter(e => e.createdAt === seededAt && customers.has(e.customerId)).map(e => e.id)),
    production: new Set(data.production.filter(t => orders.has(t.orderId)).map(t => t.id)),
    deliveries: new Set(data.deliveries.filter(t => orders.has(t.orderId)).map(t => t.id)),
    payments: new Set(data.payments.filter(p => orders.has(p.orderId)).map(p => p.id)),
    invoices: new Set(data.invoices.filter(i => orders.has(i.orderId)).map(i => i.id)),
    logs: new Set(data.logs.filter(l => orders.has(l.orderId)).map(l => l.id)),
  };
}
