import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render the actual form without opening a real store or creating test logins.
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/components/FlowerCRM.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('FlowerCRM.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const selected=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['StaffForm','Field'].includes(node.name?.text));
const moduleSource=`import {useState} from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};
const MANAGER_UID='owner';const USERNAME_PATTERN='[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}';
const ShieldCheck=()=>null,Check=()=>null,Trash2=()=>null,LoaderCircle=()=>null;
${selected.map(node=>node.getText(ast)).join('\n')}
export {StaffForm};`;
const compiled=ts.transpileModule(moduleSource,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
const {StaffForm}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const render=staff=>renderToStaticMarkup(React.createElement(StaffForm,{staff,currentUid:'owner',saving:false,submit(){},async remove(){return true}}));

test('new employee form requires username/password, not a personal email',()=>{
  const html=render(null);
  assert.match(html,/<input\b(?=[^>]*name="username")(?=[^>]*required)[^>]*>/);
  assert.match(html,/<input\b(?=[^>]*name="password")(?=[^>]*required)[^>]*>/);
  assert.doesNotMatch(html,/<input\b(?=[^>]*name="email")(?=[^>]*required)[^>]*>/);
  assert.match(html,/Email liên hệ \(không bắt buộc\)/);
});

test('email account form stays compatible while login changes are explicitly advanced',()=>{
  const html=render({id:1,name:'Quản lý',email:'manager@example.com',authUid:'manager2',role:'manager',active:true});
  assert.match(html,/<input\b(?=[^>]*name="email")(?=[^>]*required)(?=[^>]*readOnly)[^>]*>/);
  assert.doesNotMatch(html,/name="username"/);
  assert.doesNotMatch(html,/name="password"/);
  assert.match(html,/Đổi email \/ mật khẩu \(nâng cao\)/);
  assert.match(html,/Xóa nhân viên khỏi cửa hàng/);
});

test('existing username is read-only and owner cannot be removed',()=>{
  const html=render({id:1,name:'Lan',email:'',username:'lan01',authUid:'employee',role:'florist',active:true});
  assert.match(html,/<input\b(?=[^>]*name="username")(?=[^>]*readOnly)[^>]*>/);
  assert.doesNotMatch(html,/name="password"/);
  const owner=render({id:2,name:'Chủ',email:'owner@example.com',authUid:'owner',role:'manager',active:true});
  assert.doesNotMatch(owner,/Xóa nhân viên khỏi cửa hàng/);
});
