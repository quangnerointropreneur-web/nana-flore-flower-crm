import { Plus, RefreshCw } from "lucide-react";
import type { Order, Payment } from "../types";

const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + "đ";

export default function OrderPaymentSummary({ order, payments, saving, payment, refund }: { order: Order; payments: Payment[]; saving: boolean; payment: () => void; refund?: () => void }) {
  const history = payments.filter(item => item.orderId === order.id);
  return <><article className="detail-block payment-summary">
    <div className="detail-heading"><h3>Thanh toán</h3><span className={`badge ${order.remaining === 0 ? "success" : "warning"}`}>{order.paymentStatus}</span></div>
    <p><span>Tạm tính</span><b>{money(order.subtotal)}</b></p><p><span>Giảm giá</span><b>-{money(order.discount)}</b></p>
    <p><span>Phí giao hàng</span><b>{money(order.shippingFee)}</b></p>{order.surcharge > 0 && <p><span>Phụ thu</span><b>{money(order.surcharge)}</b></p>}
    {(order.refundDiscount || 0) > 0 && <p className="negative"><span>Điều chỉnh do hoàn tiền</span><b>-{money(order.refundDiscount || 0)}</b></p>}
    <p className="total"><span>Tổng thanh toán</span><b>{money(order.total)}</b></p>
    <p className="paid"><span>Đã thu từ khách</span><b>{money(order.paid + (order.refunded || 0))}</b></p>
    {(order.refunded || 0) > 0 && <><p className="negative"><span>Đã hoàn khách</span><b>-{money(order.refunded || 0)}</b></p><p><span>Tiền thực giữ</span><b>{money(order.paid)}</b></p></>}
    <p className="remaining"><span>Còn phải thu</span><b>{money(order.remaining)}</b></p>
    {order.remaining > 0 && <button className="primary-button full" onClick={payment} disabled={saving}><Plus size={15}/>Ghi nhận thanh toán</button>}
    {order.paid > 0 && refund && <button className="secondary-button full" onClick={refund} disabled={saving}><RefreshCw size={15}/>Hoàn tiền / Điều chỉnh đơn</button>}
  </article>
  {history.length > 0 && <article className="detail-block payment-history"><div className="detail-heading"><h3>Lịch sử thu / hoàn</h3></div>{history.map(item => <div key={item.id}><p><strong className={item.kind === "refund" ? "negative" : "positive"}>{item.kind === "refund" ? "Hoàn tiền" : "Nhận thanh toán"}</strong><b>{item.kind === "refund" ? "−" : "+"}{money(item.amount)}</b></p><small>{new Date(item.paidAt.replace(" ", "T") + "Z").toLocaleString("vi-VN")} · {item.method} · {item.staffName}</small>{item.notes && <small>{item.notes}</small>}</div>)}</article>}
  </>;
}
