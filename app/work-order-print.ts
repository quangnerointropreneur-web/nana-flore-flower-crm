import {getOrderItems} from "./order-items";
import type {Order,StoreData} from "./types";

export function workOrdersForPrint(orders:Order[]){
  const unique=new Map(orders.filter(order=>order.status!=="Hủy").map(order=>[order.id,order]));
  return [...unique.values()].sort((a,b)=>`${a.deliveryDate} ${a.deliveryTime||"23:59"}`.localeCompare(`${b.deliveryDate} ${b.deliveryTime||"23:59"}`)||a.code.localeCompare(b.code));
}
const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split("-").reverse().join("/"):value||"Chưa đặt ngày";

// Standalone document, without scripts or financial actions. All user-provided
// strings are escaped; long orders flow across A4 pages rather than clipping.
export function buildWorkOrderPrintHtml(orders:Order[],data:StoreData){
  const selected=workOrdersForPrint(orders);
  if(!selected.length)throw new Error("Chọn ít nhất một đơn không bị hủy để in.");
  const sheets=selected.map((order,index)=>{
    const production=data.production.find(task=>task.orderId===order.id),delivery=data.deliveries.find(task=>task.orderId===order.id);
    const items=getOrderItems(order,data.products);
    const instructions=[...new Set([order.notes,production?.instructions].filter(Boolean))].join("\n");
    return `<article class="work-sheet">
      <header><div><span>${escape(data.settings.shop.name)}</span><h1>PHIẾU LÀM ĐƠN</h1></div><div class="order-number"><strong>${escape(order.code)}</strong><small>Phiếu ${index+1}/${selected.length} · ${escape(order.status)}</small></div></header>
      <section class="deadline"><strong>${order.deliveryType==="pickup"?"NHẬN TẠI CỬA HÀNG":"GIAO TẬN NƠI"}</strong><b>${escape(date(order.deliveryDate))} · ${escape(order.deliveryTime||"Chưa đặt giờ")}</b></section>
      <section class="people"><div><h2>Người đặt</h2><p><b>${escape(order.customerName)}</b></p><p>${escape(order.customerPhone)}</p></div><div><h2>${order.deliveryType==="pickup"?"Thông tin nhận":"Người nhận"}</h2><p><b>${escape(order.recipientName||order.customerName)}</b> · ${escape(order.recipientPhone||order.customerPhone)}</p><p>${escape(order.deliveryType==="pickup"?"Nhận tại cửa hàng":order.deliveryAddress||"Chưa có địa chỉ")}</p></div></section>
      <section class="assignment"><p><b>Người làm:</b> ${escape(production?.floristName||"Chưa phân công")}</p><p><b>Người vận đơn:</b> ${escape(delivery?.shipperName||"Chưa phân công")}</p></section>
      <table><thead><tr><th>STT</th><th>Sản phẩm / yêu cầu thực hiện</th><th>SL</th></tr></thead><tbody>${items.map((item,i)=>`<tr><td>${i+1}</td><td><strong>${escape(item.name)}</strong><p>Nhóm: ${escape(item.group)}</p>${item.tone?`<p><b>Tone màu:</b> ${escape(item.tone)}</p>`:""}${item.flowerTypes?`<p><b>Loại hoa / nguyên liệu:</b> ${escape(item.flowerTypes)}</p>`:""}</td><td class="quantity">${item.quantity}</td></tr>`).join("")}</tbody></table>
      ${instructions?`<section class="note"><h2>Yêu cầu / ghi chú làm đơn</h2><div>${escape(instructions)}</div></section>`:""}
      ${!order.items?.length&&(production?.tone||production?.flowerTypes)?`<section class="note"><h2>Chi tiết mẫu cũ</h2><div>${escape([production?.tone,production?.flowerTypes].filter(Boolean).join(" · "))}</div></section>`:""}
      <section class="note"><h2>Nội dung thiệp</h2><div>${escape(order.cardMessage||"Không có nội dung thiệp")}</div></section>
      ${delivery?.notes?`<section class="note"><h2>Lưu ý giao / nhận</h2><div>${escape(delivery.notes)}</div></section>`:""}
      <footer><span>☐ Đã kiểm tra sản phẩm & số lượng</span><span>☐ Đã kiểm tra thiệp</span><span>Người kiểm tra: __________________</span></footer>
    </article>`;
  }).join("");
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phiếu làm đơn A4 · ${selected.length} đơn</title><style>
    @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,"Segoe UI",sans-serif;color:#111;background:white;margin:0;font-size:11pt;line-height:1.4}.work-sheet{max-width:186mm;margin:0 auto 12mm}.work-sheet+ .work-sheet{break-before:page;page-break-before:always}header{display:flex;justify-content:space-between;gap:15mm;border-bottom:2px solid #111;padding-bottom:4mm}header span{font-size:10pt}h1{font-size:17pt;margin:2mm 0 0}h2{font-size:10pt;margin:0 0 2mm;text-transform:uppercase}.order-number{text-align:right;display:flex;flex-direction:column;gap:2mm}.order-number strong{font-size:16pt}small{font-size:9pt}.deadline{display:flex;justify-content:space-between;gap:5mm;border:1.5px solid #111;padding:4mm;margin:5mm 0;font-size:13pt;break-inside:avoid}.people{display:grid;grid-template-columns:1fr 1.5fr;gap:8mm;break-inside:avoid}.people p,.assignment p{margin:1mm 0;overflow-wrap:anywhere}.assignment{display:flex;flex-wrap:wrap;justify-content:space-between;gap:3mm;margin:4mm 0;padding:3mm 0;border-top:1px solid #888;border-bottom:1px solid #888}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:4mm}thead{display:table-header-group}th,td{text-align:left;vertical-align:top;border:1px solid #777;padding:3mm;overflow-wrap:anywhere}th:first-child,td:first-child{width:13mm}th:last-child,td:last-child{width:17mm;text-align:center}td p{font-size:10pt;margin:1mm 0}tr{break-inside:avoid;page-break-inside:avoid}.quantity{font-weight:bold;font-size:14pt}.note{margin-top:5mm;border:1px solid #888;padding:3mm;break-inside:avoid;page-break-inside:avoid}.note div{white-space:pre-wrap;overflow-wrap:anywhere}footer{display:flex;flex-wrap:wrap;gap:4mm 8mm;border-top:1px solid #111;padding-top:4mm;margin-top:6mm;font-size:10pt;break-inside:avoid}@media screen{body{padding:16px;background:#e8ece9}.work-sheet{background:white;padding:12mm;max-width:210mm;box-shadow:0 2px 12px #0001}}@media print{.work-sheet{margin-bottom:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>${sheets}</body></html>`;
}
