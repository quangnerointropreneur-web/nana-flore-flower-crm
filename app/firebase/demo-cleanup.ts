import type { StoreData } from "../types";
const seededAt = "2026-08-15 08:00:00";
const sampleCustomerNames = ["Nguyễn Minh Anh", "Trần Hoàng Nam", "Lê Thu Hà", "Phạm Gia Hân", "Đỗ Nhật Minh", "Vũ Thanh Tú", "Bùi Bảo Ngọc", "Hoàng Đức Anh", "Nguyễn Quỳnh Chi", "Lâm Ngọc Mai", "Công ty An Nhiên", "Studio Nắng", "Trương Quốc Bảo", "Lý Phương Linh", "Hồ Hải Yến", "Đặng Khánh Vy", "Mai Tuấn Kiệt", "Phan Thảo My", "Công ty Mây Việt", "Ngô Minh Khang"];
const sampleStaff = ["lan@flore.vn", "nero@flore.vn", "hoa@flore.vn", "long@flore.vn", "vy@flore.vn"];
const sampleProducts = ["BH-001", "GH-002", "HH-003", "KT-004", "SN-005", "CB-006", "HQ-007", "CH-008", "CU-009", "TC-010", "QT-011", "TH-012", "PK-013", "HO-014", "LY-015"];
const sampleExpenses = [
  ["2026-08-01", 4200000, "Chợ hoa Hồ Thị Kỷ"], ["2026-08-04", 1350000, "Shop bao bì An Phú"],
  ["2026-08-08", 900000, "Facebook Ads"], ["2026-08-12", 2800000, "CTV cắm hoa"],
  ["2026-08-15", 6500000, "Chủ nhà"], ["2026-08-16", 450000, "Grab giao vật tư"],
] as const;

export function demoCleanupPlan(data: StoreData) {
  const sampleCode = (id: number) => `FH-260815-${String(id).padStart(3, "0")}`;
  const sampleTime = (id: number) => { const index=id-1; return `2026-08-${String(1+index%15).padStart(2,"0")} ${String(8+index%9).padStart(2,"0")}:30:00`; };
  const sampleId = (id: number) => Number.isInteger(id) && id >= 1 && id <= 30;
  const orders = new Set(data.orders.filter(o => sampleId(o.id) && o.code === sampleCode(o.id) && o.createdAt === sampleTime(o.id)).map(o => o.id));
  const retainedOrders = data.orders.filter(o => !orders.has(o.id));
  const sampleCustomer = (c: StoreData["customers"][number]) => c.createdAt === seededAt && c.id >= 1 && c.id <= 20 && (c.email === `khach${c.id}@example.com` || (c.name === sampleCustomerNames[c.id-1] && c.phone === `09${String(12000000+(c.id-1)*37691).slice(-8)}`));
  const demoCustomers = new Set(data.customers.filter(sampleCustomer).map(c=>c.id));
  const customers = new Set(data.customers.filter(c => demoCustomers.has(c.id) && !retainedOrders.some(o => o.customerId === c.id)).map(c => c.id));
  const products = new Set(data.products.filter(p => p.createdAt === seededAt && sampleProducts[p.id - 1] === p.sku && !retainedOrders.some(o => o.itemProductId === p.id || o.items?.some(item => item.productId === p.id))).map(p => p.id));
  const staff = new Set(data.staff.filter(s => !s.authUid && s.createdAt === seededAt && sampleStaff[s.id - 1] === s.email.toLowerCase()).map(s => s.id));
  const expenses = new Set(data.expenses.filter(e => { const sample = sampleExpenses[e.id - 1]; return sample && e.date === sample[0] && e.amount === sample[1] && e.vendor === sample[2] && e.createdAt === `${e.date} 09:00:00`; }).map(e => e.id));
  // Also clean original child records whose demo parent was removed earlier.
  // A reused id belonging to a real order is always protected.
  const orphan = (id: number, code: string, timestamp?: string) => sampleId(id) && code === sampleCode(id) && !retainedOrders.some(o=>o.id===id) && (!timestamp || timestamp===sampleTime(id));
  const recipients = new Set(data.recipients.filter(r => r.createdAt === seededAt && demoCustomers.has(r.customerId) && !retainedOrders.some(o=>o.customerId===r.customerId && o.recipientName===r.name && o.recipientPhone===r.phone)).map(r=>r.id));
  return {
    customers, products, staff, orders, expenses,
    recipients,
    events: new Set(data.events.filter(e => e.createdAt === seededAt && (customers.has(e.customerId) || (e.recipientId !== null && recipients.has(e.recipientId)))).map(e => e.id)),
    production: new Set(data.production.filter(t => orders.has(t.orderId) || (orphan(t.orderId,t.orderCode) && t.deliveryDate===`2026-08-${String(15+(t.orderId-1)%4).padStart(2,"0")}`)).map(t => t.id)),
    deliveries: new Set(data.deliveries.filter(t => orders.has(t.orderId) || (orphan(t.orderId,t.orderCode) && t.deliveryDate===`2026-08-${String(15+(t.orderId-1)%4).padStart(2,"0")}`)).map(t => t.id)),
    payments: new Set(data.payments.filter(p => orders.has(p.orderId) || orphan(p.orderId,p.orderCode,p.paidAt)).map(p => p.id)),
    invoices: new Set(data.invoices.filter(i => orders.has(i.orderId) || orphan(i.orderId,i.orderCode,i.issuedAt)).map(i => i.id)),
    logs: new Set(data.logs.filter(l => orders.has(l.orderId) || (sampleId(l.orderId) && !retainedOrders.some(o=>o.id===l.orderId) && l.createdAt===sampleTime(l.orderId) && l.action==="Tạo đơn" && l.staffName==="Nero Nguyễn")).map(l => l.id)),
  };
}
