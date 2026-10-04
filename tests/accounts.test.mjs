import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTs(path) {
  const source=await readFile(new URL(path,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const {handleStaffAccounts,OWNER_UID}=await loadTs('../worker/firebase-admin.ts');
const {demoCleanupPlan}=await loadTs('../app/firebase/demo-cleanup.ts');
const {buildSeedStore}=await loadTs('../app/firebase/seed.ts');
const request=(body={},token='verified-token')=>new Request('https://example.com/api/staff-accounts',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});

test('empty stores contain no demo business records',()=>{
  const store=buildSeedStore();
  for(const [name,value] of Object.entries(store))if(name!=='settings')assert.deepEqual(value,[]);
});
test('demo cleanup preserves new records with reused ids and real order references',()=>{
  const data=buildSeedStore();
  data.staff=[{id:1,email:'lan@flore.vn',createdAt:'2026-08-15 08:00:00'},{id:2,email:'real@example.com',createdAt:'2026-10-04 08:00:00'}];
  data.customers=[{id:1,email:'khach1@example.com',createdAt:'2026-08-15 08:00:00'},{id:2,email:'khach2@example.com',createdAt:'2026-08-15 08:00:00'}];
  data.orders=[{id:1,code:'FH-260815-001',createdAt:'2026-08-01 08:30:00',mapsUrl:'https://maps.google.com',customerId:1},{id:31,code:'FH-261004-031',createdAt:'2026-10-04 08:00:00',mapsUrl:'',customerId:2}];
  data.payments=[{id:1,orderId:1},{id:2,orderId:31}];
  const plan=demoCleanupPlan(data);
  assert.deepEqual([...plan.staff],[1]);assert.deepEqual([...plan.orders],[1]);assert.deepEqual([...plan.customers],[1]);assert.deepEqual([...plan.payments],[1]);
  assert.equal(demoCleanupPlan(buildSeedStore()).orders.size,0);
});

test('cleanup recognizes edited pickup demos and orphan records, without deleting real logins',()=>{
  const data=buildSeedStore();
  data.orders=[{id:1,code:'FH-260815-001',createdAt:'2026-08-01 08:30:00',mapsUrl:'',customerId:1},{id:2,code:'FH-260815-002',createdAt:'2026-08-15 11:30:00',customerId:2}];
  data.staff=[{id:1,email:'lan@flore.vn',createdAt:'2026-08-15 08:00:00',authUid:'real-issued-login'}];
  data.payments=[{id:1,orderId:3,orderCode:'FH-260815-003',paidAt:'2026-08-03 10:30:00'},{id:2,orderId:2,orderCode:'FH-260815-002',paidAt:'2026-08-02 09:30:00'}];
  const plan=demoCleanupPlan(data);
  assert.deepEqual([...plan.orders],[1]);assert.deepEqual([...plan.payments],[1]);assert.equal(plan.staff.size,0);
});
test('account management rejects anonymous and cross-origin requests without Firebase calls',async()=>{
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected Firebase call')};
  try{
    assert.equal((await handleStaffAccounts(request({},''),{})).status,401);
    const cross=request();cross.headers.set('Origin','https://evil.example');
    assert.equal((await handleStaffAccounts(cross,{})).status,403);
  }finally{globalThis.fetch=oldFetch}
});
test('staff cannot administer accounts and manager sees an explicit missing-setup error',async()=>{
  const oldFetch=globalThis.fetch;
  try{
    globalThis.fetch=async url=>String(url).includes('accounts:lookup')?Response.json({users:[{localId:'sales-user'}]}):Response.json({fields:{active:{booleanValue:true},role:{stringValue:'sales'}}});
    assert.equal((await handleStaffAccounts(request({action:'createStaff'}),{})).status,403);
    globalThis.fetch=async()=>Response.json({users:[{localId:OWNER_UID}]});
    const result=await handleStaffAccounts(request({action:'updateStaff',id:1}),{});
    assert.equal(result.status,503);assert.match((await result.json()).error,/Service Account/);
  }finally{globalThis.fetch=oldFetch}
});
test('disabled accounts are rejected before credentials or records are touched',async()=>{
  const oldFetch=globalThis.fetch;
  try{globalThis.fetch=async()=>Response.json({users:[{localId:OWNER_UID,disabled:true}]});assert.equal((await handleStaffAccounts(request({action:'deleteStaff',id:1}),{})).status,401)}finally{globalThis.fetch=oldFetch}
});

const keyPair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const privateKey=Buffer.from(await crypto.subtle.exportKey('pkcs8',keyPair.privateKey)).toString('base64');
const env={FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'nananerospace',client_email:'test@nananerospace.iam.gserviceaccount.com',private_key:`-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`})};
const directory={name:'projects/nananerospace/databases/(default)/documents/flore_stores/default/staff/1',updateTime:'2026-10-04T00:00:00Z',fields:{id:{integerValue:'1'},authUid:{stringValue:'employee'},name:{stringValue:'Nhân viên'},email:{stringValue:'old@example.com'},role:{stringValue:'sales'},active:{booleanValue:true},createdAt:{stringValue:'2026-10-04 00:00:00'}}};
const membership={...directory,name:directory.name.replace('staff/1','staffAuth/employee'),fields:{uid:{stringValue:'employee'},staffId:{integerValue:'1'},name:{stringValue:'Nhân viên'},email:{stringValue:'old@example.com'},role:{stringValue:'sales'},active:{booleanValue:true}}};

test('manager changes email/password in Auth and directory; passwords never enter Firestore',async()=>{
  const oldFetch=globalThis.fetch;const calls=[];
  try{
    globalThis.fetch=async(url,options={})=>{
      const path=String(url),body=options.body&&typeof options.body==='string'?JSON.parse(options.body):null;calls.push({path,body});
      if(path.includes('accounts:lookup'))return Response.json({users:[{localId:OWNER_UID}]});
      if(path.includes('oauth2'))return Response.json({access_token:'server-only-token'});
      if(path.includes('/staff/1'))return Response.json(directory);
      if(path.includes('/staffAuth/'))return Response.json(membership);
      if(path.endsWith(':commit'))return Response.json({writeResults:[{updateTime:'new-staff-time'},{updateTime:'new-auth-time'}]});
      if(path.endsWith(':update'))return Response.json({localId:'employee'});
      throw Error(`Unexpected API ${path}`);
    };
    const result=await handleStaffAccounts(request({action:'updateStaff',id:1,name:'Tên mới',email:'new@example.com',password:'new-password',role:'florist',active:true}),env);
    assert.equal(result.status,200);
    const auth=calls.find(call=>call.path.endsWith(':update')).body;
    assert.equal(auth.localId,'employee');assert.equal(auth.password,'new-password');assert.equal(auth.email,'new@example.com');
    const writes=calls.find(call=>call.path.endsWith(':commit')).body.writes;
    assert.equal(writes[0].update.fields.email.stringValue,'new@example.com');assert.equal(writes[1].update.fields.role.stringValue,'florist');
    assert.doesNotMatch(JSON.stringify(writes),/new-password|password/);
  }finally{globalThis.fetch=oldFetch}
});
test('an email collision rolls directory changes back and reports the failure',async()=>{
  const oldFetch=globalThis.fetch;const commits=[];
  try{
    globalThis.fetch=async(url,options={})=>{
      const path=String(url);
      if(path.includes('accounts:lookup'))return Response.json({users:[{localId:OWNER_UID}]});
      if(path.includes('oauth2'))return Response.json({access_token:'server-only-token'});
      if(path.includes('/staff/1'))return Response.json(directory);
      if(path.includes('/staffAuth/'))return Response.json(membership);
      if(path.endsWith(':commit')){commits.push(JSON.parse(options.body));return Response.json({writeResults:[{updateTime:'new-staff-time'},{updateTime:'new-auth-time'}]})}
      if(path.endsWith(':update'))return Response.json({error:{message:'EMAIL_EXISTS'}},{status:400});
      throw Error(`Unexpected API ${path}`);
    };
    const result=await handleStaffAccounts(request({action:'updateStaff',id:1,name:'Tên mới',email:'taken@example.com',role:'sales',active:true}),env);
    assert.equal(result.status,400);assert.match((await result.json()).error,/đã có tài khoản/);
    assert.equal(commits.length,2);assert.equal(commits[1].writes[0].update.fields.email.stringValue,'old@example.com');assert.equal(commits[1].writes[0].currentDocument.updateTime,'new-staff-time');
  }finally{globalThis.fetch=oldFetch}
});
