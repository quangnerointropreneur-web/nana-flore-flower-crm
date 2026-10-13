"use client";
import {useMemo,useRef,useState} from "react";
import {Printer} from "lucide-react";
import {buildWorkOrderPrintHtml,workOrdersForPrint} from "../work-order-print";
import type {Order,StoreData} from "../types";

export default function BulkWorkPrint({orders,data}:{orders:Order[];data:StoreData}){
  const frame=useRef<HTMLIFrameElement>(null),[ready,setReady]=useState(false),[error,setError]=useState("");
  const selected=workOrdersForPrint(orders);
  const html=useMemo(()=>selected.length?buildWorkOrderPrintHtml(selected,data):"",[orders,data]);
  return <div className="bulk-work-print"><div className="bulk-print-toolbar"><div><strong>{selected.length} phiếu làm đơn · A4 dọc</strong><small>Mỗi đơn bắt đầu ở trang mới, xếp theo ngày / giờ giao. Không tạo hóa đơn hoặc đổi trạng thái đơn.</small></div><button className="primary-button" disabled={!ready||!selected.length} onClick={()=>{setError("");try{const window=frame.current?.contentWindow;if(!window)throw new Error();window.focus();window.print()}catch{setError("Không mở được hộp thoại in. Vui lòng thử lại trong trình duyệt.")}}}><Printer size={16}/>In {selected.length} phiếu A4</button></div>
    {error&&<p className="login-error" role="alert">{error}</p>}
    {selected.length?<iframe ref={frame} title="Xem trước phiếu làm đơn A4" srcDoc={html} sandbox="allow-same-origin allow-modals" onLoad={()=>setReady(true)}/>:<p className="field-help">Không còn đơn hợp lệ để in. Đơn đã hủy không được đưa vào phiếu làm đơn.</p>}
  </div>;
}
