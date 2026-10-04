import { jsPDF } from "jspdf";
import { getOrderItems } from "./order-items";
import type { Invoice, StoreData } from "./types";

export function buildInvoicePdf(invoice:Invoice,settings:StoreData["settings"]){
  const pdf=new jsPDF({unit:"mm",format:"a5"});
  const plain=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D");
  const money=(value:number)=>new Intl.NumberFormat("vi-VN").format(value)+" VND";
  let y=18;
  const ensureSpace=(height:number)=>{if(y+height>195){pdf.addPage();y=16;pdf.setFont("helvetica","bold");pdf.setFontSize(9);pdf.text(`HOA DON ${invoice.number} (tiep)`,12,y);y+=10;pdf.setFont("helvetica","normal")}};
  pdf.setFont("helvetica","bold");pdf.setFontSize(17);pdf.text(plain(settings.shop.name),74,y,{align:"center"});y+=8;
  pdf.setFont("helvetica","normal");pdf.setFontSize(9);
  for(const line of pdf.splitTextToSize(plain(settings.shop.address),124)){pdf.text(line,74,y,{align:"center"});y+=5}
  pdf.text("HOA DON BAN LE",74,y+8,{align:"center"});y+=18;
  pdf.text(`So: ${invoice.number}`,12,y);y+=7;
  pdf.text(`Khach: ${plain(invoice.customerName)}`,12,y);y+=6;
  if(settings.invoice.showPhone){pdf.text(`SDT: ${invoice.customerPhone}`,12,y);y+=6}
  if(settings.invoice.showAddress&&invoice.customerAddress){for(const line of pdf.splitTextToSize(`Dia chi: ${plain(invoice.customerAddress)}`,124)){ensureSpace(6);pdf.text(line,12,y);y+=5}}
  y+=7;
  getOrderItems(invoice).forEach((item,index)=>{
    const lines=pdf.splitTextToSize(`${index+1}. ${plain(item.name)} (${plain(item.group)})`,88);
    ensureSpace(lines.length*5+14);
    pdf.setFont("helvetica","bold");pdf.text(lines,12,y);pdf.text(money(item.quantity*item.unitPrice),136,y,{align:"right"});
    y+=lines.length*5;pdf.setFont("helvetica","normal");pdf.text(`SL: ${item.quantity}  x  ${money(item.unitPrice)}`,12,y);y+=8;pdf.line(12,y,136,y);y+=5;
  });
  ensureSpace(60);
  const totalLine=(label:string,amount:number,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.text(label,12,y);pdf.text(money(amount),136,y,{align:"right"});y+=7};
  totalLine("Tam tinh",invoice.subtotal);
  if(settings.invoice.showDiscount)totalLine("Giam gia",-invoice.discount);
  if(settings.invoice.showShipping)totalLine("Phi giao hang",invoice.shippingFee);
  if(invoice.surcharge)totalLine("Phu thu",invoice.surcharge);
  totalLine("TONG THANH TOAN",invoice.total,true);totalLine("Da thanh toan",invoice.paid);totalLine("Con lai",invoice.remaining);
  ensureSpace(15);y+=5;pdf.setFont("helvetica","italic");pdf.text(plain(settings.shop.footer),74,y,{align:"center"});
  return pdf;
}

export function downloadInvoicePdf(invoice:Invoice,settings:StoreData["settings"]){
  buildInvoicePdf(invoice,settings).save(`Invoice_${invoice.orderCode}.pdf`);
}
