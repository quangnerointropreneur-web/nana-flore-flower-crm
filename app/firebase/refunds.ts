import { collection, doc, getDoc, getDocs, runTransaction, type DocumentData } from "firebase/firestore";
import { firebaseAuth, firestore, MANAGER_UID } from "./client";
import { calculateRefund, localDateTimeInput } from "../finance";
import { getOrderItems, itemNetAmounts } from "../order-items";
import type { Customer, DeliveryTask, Invoice, Order, Payment, Product } from "../types";

const root = ["flore_stores", "default"] as const;
const ref = (name: string, id: number | string) => doc(firestore, ...root, name, String(id));

// Original receipts stay immutable. Related balances commit atomically and a
// stable request UUID prevents double refunds when retrying a lost response.
export async function recordOrderRefund(body: Record<string, unknown>, actorName: string) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Vui lòng đăng nhập trước.");
  if (user.uid !== MANAGER_UID) {
    const member = await getDoc(ref("staffAuth", user.uid));
    if (!member.exists() || member.data().active !== true || member.data().role !== "manager") throw new Error("Chỉ quản lý được ghi nhận hoàn tiền / điều chỉnh đơn.");
  }
  const orderId = Number(body.orderId), amount = Number(body.amount), reason = String(body.reason || "").trim();
  const method = String(body.method || ""), requestId = String(body.requestId || "").toLowerCase();
  if (!Number.isSafeInteger(orderId) || orderId <= 0) throw new Error("Mã đơn không hợp lệ.");
  if (!reason || reason.length > 300) throw new Error("Nhập lý do hoàn tiền (tối đa 300 ký tự).");
  if (!["Chuyển khoản", "QR", "Tiền mặt", "Thẻ"].includes(method)) throw new Error("Chọn phương thức hoàn tiền hợp lệ.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) throw new Error("Phiên hoàn tiền không hợp lệ. Hãy mở lại biểu mẫu.");
  const localTime = String(body.refundedAt || ""), date = new Date(`${localTime}+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime) || !Number.isFinite(date.getTime()) || localDateTimeInput(date)!==localTime || date.getTime() > Date.now() + 300000) throw new Error("Thời gian hoàn tiền không hợp lệ hoặc nằm trong tương lai.");
  const paidAt = date.toISOString().slice(0, 19).replace("T", " "), createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const adjustOrder = body.adjustOrder === true || body.adjustOrder === "on";
  const id = Number.parseInt(requestId.replaceAll("-", "").slice(0, 12), 16);
  const [invoices, deliveries] = await Promise.all([getDocs(collection(firestore, ...root, "invoices")), getDocs(collection(firestore, ...root, "deliveries"))]);
  const invoiceRefs = invoices.docs.filter(row => row.data().orderId === orderId).map(row => row.ref);
  const deliveryRef = deliveries.docs.find(row => row.data().orderId === orderId)?.ref;
  await runTransaction(firestore, async transaction => {
    const [paymentSnapshot, orderSnapshot] = await Promise.all([transaction.get(ref("payments", id)), transaction.get(ref("orders", orderId))]);
    if (paymentSnapshot.exists()) {
      const previous = paymentSnapshot.data();
      if (previous.requestId === requestId && previous.orderId === orderId && previous.kind === "refund") {
        if(previous.amount!==amount||previous.adjustmentAmount!==(adjustOrder?amount:0)||previous.notes!==reason||previous.method!==method||previous.paidAt!==paidAt)throw new Error("Giao dịch này đã được ghi nhận trước đó. Hãy tải lại dữ liệu trước khi hoàn tiếp.");
        return;
      }
      throw new Error("Mã giao dịch bị trùng. Hãy mở lại biểu mẫu.");
    }
    if (!orderSnapshot.exists()) throw new Error("Không tìm thấy đơn hàng.");
    const order = orderSnapshot.data() as Order;
    const [customerSnapshot, deliverySnapshot, ...invoiceSnapshots] = await Promise.all([
      transaction.get(ref("customers", order.customerId)), deliveryRef ? transaction.get(deliveryRef) : Promise.resolve(null), ...invoiceRefs.map(item => transaction.get(item)),
    ]);
    const delivery = deliverySnapshot?.data() as DeliveryTask | undefined;
    const updated = calculateRefund(order, amount, adjustOrder, delivery?.status === "Đã giao");
    const items = getOrderItems(order), before = itemNetAmounts(items, order.discount + (order.refundDiscount || 0)), after = itemNetAmounts(items, updated.discount + updated.refundDiscount);
    const revenueChanges = new Map<number, number>();
    if (order.status !== "Hủy") items.forEach((item, index) => { if (item.productId) revenueChanges.set(item.productId, (revenueChanges.get(item.productId) || 0) + after[index] - before[index]); });
    const productSnapshots = await Promise.all([...revenueChanges.keys()].map(productId => transaction.get(ref("products", productId))));
    const payment: Payment = { id, orderId, orderCode: order.code, customerName: order.customerName, kind: "refund", requestId, amount, adjustmentAmount: adjustOrder ? amount : 0, method, reference: String(body.reference || "").trim().slice(0, 80), notes: reason, paidAt, createdAt, staffName: actorName };
    transaction.set(ref("payments", id), payment as DocumentData);
    transaction.set(orderSnapshot.ref, updated);
    if (customerSnapshot.exists() && adjustOrder) { const customer = customerSnapshot.data() as Customer; transaction.set(customerSnapshot.ref, { ...customer, totalSpent: Math.max(0, customer.totalSpent - amount) }); }
    if (deliverySnapshot?.exists()) transaction.set(deliverySnapshot.ref, { ...delivery, cod: updated.remaining });
    for (const snapshot of invoiceSnapshots) if (snapshot?.exists()) {
      const invoice = snapshot.data() as Invoice;
      transaction.set(snapshot.ref, { ...invoice, total: updated.total, paid: updated.paid, remaining: updated.remaining, paymentStatus: updated.paymentStatus, refunded: updated.refunded, refundDiscount: updated.refundDiscount });
    }
    for (const snapshot of productSnapshots) if (snapshot.exists()) { const product = snapshot.data() as Product; transaction.set(snapshot.ref, { ...product, revenue: Math.max(0, product.revenue + (revenueChanges.get(product.id) || 0)) }); }
    transaction.set(ref("logs", id), { id, orderId, action: "Hoàn tiền / Điều chỉnh đơn", details: `${amount.toLocaleString("vi-VN")}đ · ${method} · ${reason}${adjustOrder ? ` · Giảm giá trị đơn còn ${updated.total.toLocaleString("vi-VN")}đ` : " · Không giảm giá trị đơn"}`, staffName: actorName, createdAt });
  });
}
