import type { Invoice, Order, OrderItem, Product } from "./types";

export function getOrderItems(order: Pick<Order | Invoice, "items" | "itemName" | "quantity" | "unitPrice"> & { itemProductId?: number | null; itemSku?: string }, products: Product[] = []): OrderItem[] {
  if (order.items?.length) return order.items.map(item => ({ ...item, tone: item.tone || "", flowerTypes: item.flowerTypes || "" }));
  const product = products.find(item => item.id === order.itemProductId || item.sku === order.itemSku);
  return [{ id: "legacy", name: order.itemName, group: product?.category || "Theo yêu cầu", quantity: order.quantity, unitPrice: order.unitPrice, productId: order.itemProductId || null, sku: order.itemSku || "CUSTOM", tone: "", flowerTypes: "" }];
}

export function parseOrderItems(value: unknown, legacy: Record<string, unknown>, groups: string[]): OrderItem[] {
  let input = value;
  if (typeof input === "string") { try { input = JSON.parse(input); } catch { throw new Error("Danh sách sản phẩm không hợp lệ"); } }
  if (input === undefined) input = [{ name: legacy.itemName, group: legacy.category || groups[0] || "Theo yêu cầu", quantity: legacy.quantity, unitPrice: legacy.unitPrice, tone: legacy.tone, flowerTypes: legacy.flowerTypes, productId: legacy.productId }];
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new Error("Đơn hàng cần từ 1 đến 100 dòng sản phẩm");
  const used = new Set<string>();
  const items = input.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Sản phẩm ${index + 1} không hợp lệ`);
    const item = raw as Record<string, unknown>;
    const name = String(item.name || "").trim().slice(0, 160), group = String(item.group || "").trim().slice(0, 80);
    const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice);
    if (!name || !group) throw new Error(`Nhập tên và chọn nhóm cho sản phẩm ${index + 1}`);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(unitPrice) || unitPrice <= 0 || !Number.isSafeInteger(quantity * unitPrice)) throw new Error(`Số lượng hoặc đơn giá sản phẩm ${index + 1} không hợp lệ`);
    let id = String(item.id || `item-${index + 1}`).slice(0, 80);
    let suffix = 0;
    while (used.has(id)) id = `item-${index + 1}-${++suffix}`;
    used.add(id);
    return { id, name, group, quantity, unitPrice, productId: Number(item.productId) || null, sku: String(item.sku || "CUSTOM").slice(0, 40), tone: String(item.tone || "").trim().slice(0, 60), flowerTypes: String(item.flowerTypes || "").trim().slice(0, 160) };
  });
  if (!Number.isSafeInteger(itemsSubtotal(items))) throw new Error("Tổng giá trị sản phẩm quá lớn");
  return items;
}

export function itemsSubtotal(items: OrderItem[]) { return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); }
export function itemsSummary(items: OrderItem[]) { return items.length === 1 ? items[0].name : items.map(item => `${item.name} ×${item.quantity}`).join("; "); }

export function itemNetAmounts(items: OrderItem[], discount: number) {
  const subtotal = itemsSubtotal(items), applied = Math.min(Math.max(0, discount), subtotal);
  let cumulative = 0, previous = 0;
  return items.map(item => {
    const gross = item.quantity * item.unitPrice;
    cumulative += gross;
    const allocated = subtotal ? Math.round(applied * cumulative / subtotal) : 0;
    const net = gross - (allocated - previous); previous = allocated;
    return net;
  });
}

export function productStatistics(orders: Order[], products: Product[] = []) {
  const rows = new Map<string, { name: string; group: string; quantity: number; gross: number; revenue: number; orderIds: Set<number> }>();
  for (const order of orders) {
    if (order.status === "Hủy") continue;
    const items = getOrderItems(order, products), amounts = itemNetAmounts(items, order.discount);
    items.forEach((item, index) => {
      const key = JSON.stringify([item.name.trim().toLocaleLowerCase("vi"), item.group.trim().toLocaleLowerCase("vi")]);
      const row = rows.get(key) || { name: item.name, group: item.group, quantity: 0, gross: 0, revenue: 0, orderIds: new Set<number>() };
      row.quantity += item.quantity; row.gross += item.quantity * item.unitPrice; row.revenue += amounts[index]; row.orderIds.add(order.id); rows.set(key, row);
    });
  }
  return [...rows.values()].map(row => ({ name: row.name, group: row.group, quantity: row.quantity, gross: row.gross, revenue: row.revenue, orderCount: row.orderIds.size })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "vi"));
}
