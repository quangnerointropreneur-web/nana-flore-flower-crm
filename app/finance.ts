import type { Order, Payment } from "./types";

export function localDateTimeInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function paymentDate(payment: Pick<Payment, "paidAt">) {
  if (payment.paidAt.length === 10) return payment.paidAt;
  const date = new Date(payment.paidAt.replace(" ", "T") + (/Z$|[+-]\d\d:\d\d$/.test(payment.paidAt) ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? "" : localDateTimeInput(date).slice(0, 10);
}

export function paymentCashFlow(payments: Payment[], fromDate = "", toDate = "9999-12-31") {
  let received = 0, refunded = 0;
  for (const payment of payments) {
    const date = paymentDate(payment);
    if (!date || date < fromDate || date > toDate) continue;
    if (payment.kind === "refund") refunded += payment.amount;
    else received += payment.amount; // Existing payment records have no kind.
  }
  return { received, refunded, net: received - refunded };
}

export function calculateRefund(order: Order, amount: number, adjustOrder: boolean, delivered: boolean) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > order.paid) throw new Error("Tiền hoàn phải lớn hơn 0 và không vượt số tiền cửa hàng đang giữ.");
  if (adjustOrder && amount > order.total) throw new Error("Không thể giảm giá trị đơn thấp hơn 0.");
  const paid = order.paid - amount, total = order.total - (adjustOrder ? amount : 0), remaining = total - paid;
  if (remaining < 0) throw new Error("Số dư đơn chưa hợp lệ. Hãy kiểm tra lại thanh toán.");
  return {
    ...order, paid, total, remaining,
    refunded: (order.refunded || 0) + amount,
    refundDiscount: (order.refundDiscount || 0) + (adjustOrder ? amount : 0),
    financeRevision: (order.financeRevision || 0) + 1,
    paymentStatus: total === 0 && paid === 0 ? "Đã hoàn tiền" : remaining === 0 ? "Đã thanh toán đủ" : paid > 0 ? "Đã cọc" : "Chưa thanh toán",
    status: order.status === "Hủy" ? "Hủy" : delivered ? (remaining === 0 ? "Hoàn thành" : "Đã hoàn thiện") : order.status,
    dueDate: remaining === 0 ? "" : order.dueDate || order.deliveryDate,
  };
}
