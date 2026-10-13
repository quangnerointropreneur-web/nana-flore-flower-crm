import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const uri=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile=async path=>ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{fileName:path,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const finance=uri(await compile('../app/finance.ts'));
async function component(path){
  const code=(await compile(path)).replaceAll('"../finance"',JSON.stringify(finance)).replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href)).replaceAll('"react"',JSON.stringify(pathToFileURL(require.resolve('react')).href)).replace(/^import .* from "lucide-react";$/m,'const AlertCircle=()=>null,Check=()=>null,LoaderCircle=()=>null,RefreshCw=()=>null,Plus=()=>null;');
  return (await import(uri(code))).default;
}
const RefundForm=await component('../app/components/RefundForm.tsx');
const Summary=await component('../app/components/OrderPaymentSummary.tsx');
const order={id:1,code:'FH-TEST',customerName:'Khách',subtotal:1000000,total:500000,discount:0,refundDiscount:500000,paid:500000,refunded:500000,remaining:0,shippingFee:0,surcharge:0,paymentStatus:'Đã thanh toán đủ'};

test('refund form requires reason/time/confirmation and makes clear that it does not transfer money',()=>{
  const html=renderToStaticMarkup(React.createElement(RefundForm,{order,delivered:true,saving:false,submit:async()=>false}));
  assert.match(html,/không tự chuyển tiền/);assert.match(html,/Lý do hoàn tiền/);assert.match(html,/name="refundedAt"/);assert.match(html,/Giảm giá trị đơn tương ứng/);assert.match(html,/Tôi xác nhận/);
  assert.match(html,/<input\b(?=[^>]*required)(?=[^>]*type="checkbox")[^>]*>/);
});

test('order detail shows gross receipts, refunds, net money and unchanged payment history',()=>{
  const props={order,saving:false,payment(){},refund(){},payments:[{id:1,orderId:1,amount:1000000,paidAt:'2026-10-13 03:00:00',method:'Tiền mặt'},{id:2,orderId:1,kind:'refund',amount:500000,paidAt:'2026-10-13 04:00:00',method:'Chuyển khoản',notes:'Hoa không đúng yêu cầu'}]};
  const html=renderToStaticMarkup(React.createElement(Summary,props));
  for(const label of ['Đã thu từ khách','Đã hoàn khách','Tiền thực giữ','Lịch sử thu / hoàn','Hoa không đúng yêu cầu','Hoàn tiền / Điều chỉnh đơn'])assert.ok(html.includes(label));
  assert.ok(html.includes('1.000.000đ'));assert.ok(html.includes('500.000đ'));
  const withoutPermission=renderToStaticMarkup(React.createElement(Summary,{...props,refund:undefined}));assert.doesNotMatch(withoutPermission,/Hoàn tiền \/ Điều chỉnh đơn/);
});
