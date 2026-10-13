"use client";

import { useState } from "react";
import { AlertCircle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { calculateRefund, localDateTimeInput } from "../finance";
import type { Order } from "../types";

const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + "đ";

export default function RefundForm({ order, delivered, saving, submit }: { order: Order; delivered: boolean; saving: boolean; submit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [amount, setAmount] = useState("");
  const [adjustOrder, setAdjustOrder] = useState(true);
  const [requestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  let preview: ReturnType<typeof calculateRefund> | null = null;
  try { if (Number(amount) > 0) preview = calculateRefund(order, Number(amount), adjustOrder, delivered); } catch { /* Validated on submission too. */ }
  return <form className="refund-form" onSubmit={event => {
    event.preventDefault(); setError("");
    try { calculateRefund(order, Number(amount), adjustOrder, delivered); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Số tiền chưa hợp lệ"); return; }
    void submit({ ...Object.fromEntries(new FormData(event.currentTarget).entries()), orderId: order.id, amount: Number(amount), adjustOrder, requestId });
  }}>
    <div className="auth-logic-note compact"><RefreshCw size={17}/><span><strong>{order.code} · {order.customerName}</strong><small>Chỉ ghi nhận khoản tiền đã hoàn cho khách, không tự chuyển tiền. Lịch sử thanh toán ban đầu được giữ nguyên.</small></span></div>
    <div className="payment-balance"><span><small>Giá trị đơn hiện tại</small><strong>{money(order.total)}</strong></span><span><small>Đã hoàn trước đây</small><strong>{money(order.refunded || 0)}</strong></span><span><small>Tiền đang giữ</small><strong>{money(order.paid)}</strong></span></div>
    <label className="field"><span>Số tiền hoàn lần này</span><div className="payment-amount-input"><input name="amount" type="number" min="1" step="1" max={order.paid} value={amount} onChange={event => setAmount(event.target.value)} placeholder="Nhập số tiền đã hoàn" required/><b>đ</b></div></label>
    <div className="payment-quick-amounts"><button type="button" onClick={() => setAmount(String(Math.floor(order.paid / 2)))}>Hoàn 50% tiền đang giữ</button><button type="button" onClick={() => setAmount(String(order.paid))}>Hoàn toàn bộ tiền đang giữ</button></div>
    <div className="form-grid">
      <label className="field"><span>Phương thức hoàn tiền</span><select name="method"><option>Chuyển khoản</option><option>Tiền mặt</option><option>QR</option><option>Thẻ</option></select></label>
      <label className="field"><span>Thời gian đã hoàn (giờ Việt Nam)</span><input type="datetime-local" name="refundedAt" defaultValue={localDateTimeInput()} max={localDateTimeInput()} required/></label>
      <label className="field span-2"><span>Lý do hoàn tiền</span><textarea name="reason" maxLength={300} placeholder="Ví dụ: Bồi hoàn do hoa không đúng yêu cầu" required/></label>
      <label className="field span-2"><span>Mã giao dịch / tham chiếu</span><input name="reference" maxLength={80} placeholder="Không bắt buộc"/></label>
    </div>
    <label className="refund-choice"><input type="checkbox" checked={adjustOrder} onChange={event => setAdjustOrder(event.target.checked)}/><span><strong>Giảm giá trị đơn tương ứng số tiền hoàn</strong><small>Dùng khi giảm giá / bồi hoàn cho khách. Nếu bỏ chọn, giá trị đơn giữ nguyên và số tiền cần thu lại sẽ tăng.</small></span></label>
    <div className="refund-preview" aria-live="polite"><strong>Sau khi ghi nhận</strong>{preview ? <><p><span>Giá trị đơn</span><b>{money(preview.total)}</b></p><p><span>Tổng tiền đã hoàn</span><b>{money(preview.refunded)}</b></p><p><span>Tiền còn giữ</span><b>{money(preview.paid)}</b></p><p><span>Còn phải thu</span><b>{money(preview.remaining)}</b></p>{!adjustOrder && <small className="negative">Giữ nguyên giá trị đơn: khách sẽ còn phải thanh toán {money(preview.remaining)}.</small>}</> : <p>Nhập số tiền hợp lệ để xem số dư sau hoàn tiền.</p>}</div>
    <label className="refund-choice"><input type="checkbox" required/><span>Tôi xác nhận cửa hàng đã hoàn số tiền trên cho khách.</span></label>
    {error && <p className="login-error" role="alert"><AlertCircle size={14}/>{error}</p>}
    <div className="modal-footer"><button className="primary-button" disabled={saving || !preview}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}Ghi nhận hoàn tiền</button></div>
  </form>;
}
