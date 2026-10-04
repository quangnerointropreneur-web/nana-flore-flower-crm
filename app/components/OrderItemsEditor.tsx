"use client";
import { Plus, Trash2 } from "lucide-react";
import type { OrderItem } from "../types";

const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + "đ";
export const emptyOrderItem = (group: string): OrderItem => ({ id: crypto.randomUUID(), name: "", group, quantity: 1, unitPrice: 0, productId: null, sku: "CUSTOM", tone: "", flowerTypes: "" });

export default function OrderItemsEditor({ items, groups, onChange }: { items: OrderItem[]; groups: string[]; onChange: (items: OrderItem[]) => void }) {
  const update = (id: string, values: Partial<OrderItem>) => onChange(items.map(item => item.id === id ? { ...item, ...values } : item));
  return <div className="order-items-editor">{items.map((item, index) => <article className="order-item-entry" key={item.id}>
    <header><strong>Sản phẩm {index + 1}</strong>{items.length > 1 && <button type="button" className="text-button item-remove" aria-label={`Xóa sản phẩm ${index + 1}`} onClick={() => onChange(items.filter(entry => entry.id !== item.id))}><Trash2 size={15}/>Xóa dòng</button>}</header>
    <label className="field"><span>Tên sản phẩm</span><input value={item.name} onChange={event => update(item.id, { name: event.target.value, productId: null, sku: "CUSTOM" })} placeholder="Ví dụ: Bó hoa tone hồng" maxLength={160} required/></label>
    <div className="field product-group-field"><span>Nhóm sản phẩm</span><div className="product-group-buttons" role="group" aria-label={`Nhóm sản phẩm ${index + 1}`}>{[...new Set([...groups, item.group].filter(Boolean))].map(group => <button type="button" key={group} aria-pressed={item.group === group} className={item.group === group ? "active" : ""} onClick={() => update(item.id, { group })}>{group}</button>)}</div></div>
    <div className="item-price-grid"><label className="field"><span>Số lượng</span><input type="number" min={1} step={1} value={item.quantity || ""} onChange={event => update(item.id, { quantity: Number(event.target.value) })} required/></label><label className="field"><span>Đơn giá theo đơn</span><input type="number" min={1} step={1} value={item.unitPrice || ""} onChange={event => update(item.id, { unitPrice: Number(event.target.value) })} placeholder="Nhập đơn giá" required/></label><div className="field"><span>Thành tiền</span><output className="readonly-money">{money(item.quantity * item.unitPrice)}</output></div></div>
    <details className="item-extra"><summary>Yêu cầu riêng cho sản phẩm (nếu có)</summary><div className="form-grid"><label className="field"><span>Tone màu</span><input value={item.tone} onChange={event => update(item.id, { tone: event.target.value })} placeholder="Hồng pastel, trắng xanh..."/></label><label className="field"><span>Loại hoa / nguyên liệu</span><input value={item.flowerTypes} onChange={event => update(item.id, { flowerTypes: event.target.value })} placeholder="Hồng, tulip, trái cây..."/></label></div></details>
  </article>)}<button type="button" className="secondary-button add-order-item" disabled={items.length >= 100} onClick={() => onChange([...items, emptyOrderItem(groups[0] || "Theo yêu cầu")])}><Plus size={16}/>Thêm sản phẩm</button></div>;
}
