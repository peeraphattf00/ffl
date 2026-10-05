"use client";
import {useState,type FormEvent,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Choose,type Data} from './league';
export async function post(path:string,body:Record<string,unknown>){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json() as {error?:string}&Record<string,unknown>;if(!r.ok)throw new Error(d.error||'ทำรายการไม่สำเร็จ');return d}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field">{label}{children}</label>}
// Sign-in for accounts, and first-admin setup for the verified Site owner.
export function SignIn({data,close,done}:{data:Data;close:()=>void;done:()=>Promise<unknown>}){
 const bootstrap=!data.hasAdmin&&data.setupAllowed;
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[profileId,setProfileId]=useState(data.state.profiles.find(p=>p.id==='player-1')?.id||data.state.profiles[0]?.id||''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setErr('');setBusy(true);try{
  if(bootstrap){if(password!==confirm)throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');await post('/api/auth',{action:'bootstrap',username,password,profileId})}
  else await post('/api/auth',{action:'login',username,password});
  await done();close()}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}
 const title=bootstrap?'สร้างผู้ดูแลระบบคนแรก':'เข้าสู่ระบบ';
 const blocked=!data.hasAdmin&&!data.setupAllowed;
 return <Dialog open onOpenChange={v=>!v&&!busy&&close()}><DialogContent className="modal"><DialogTitle>{title}</DialogTitle><DialogDescription>{bootstrap?'ตั้งบัญชีผู้ดูแลของคุณ เพื่อสร้างบัญชีให้เพื่อนต่อ':'ใช้ชื่อผู้ใช้และรหัสผ่านที่ผู้ดูแลให้ไว้'}</DialogDescription><form className="form-stack" onSubmit={submit}>
  {blocked?<p className="error">ยังไม่มีผู้ดูแลระบบ เจ้าของเว็บไซต์ต้องสร้างบัญชีแรกก่อน <a href="/signin-with-chatgpt?return_to=/" target="_top">เข้าสู่ระบบเจ้าของ</a></p>
  :<><Field label="ชื่อผู้ใช้"><input autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} minLength={bootstrap?3:1} maxLength={30} pattern={bootstrap?'[A-Za-z0-9._-]+':undefined} title="a–z, 0–9 และ . _ -" required autoFocus/></Field>
   {bootstrap&&<div className="field">โปรไฟล์ผู้เล่นของคุณ<Choose value={profileId} onChange={setProfileId} items={data.state.profiles} label="โปรไฟล์ผู้เล่น"/></div>}
   <Field label={bootstrap?'ตั้งรหัสผ่านอย่างน้อย 8 ตัวอักษร':'รหัสผ่าน'}><input type="password" autoComplete={bootstrap?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={bootstrap?8:1} maxLength={128} required/></Field>
   {bootstrap&&<Field label="ยืนยันรหัสผ่าน"><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} maxLength={128} required/></Field>}</>}
  {err&&<p className="error" role="alert">{err}</p>}
  <div className="actions"><Button type="submit" disabled={busy||blocked}>{busy?'กำลังตรวจสอบ…':bootstrap?'สร้างบัญชีผู้ดูแล':'เข้าสู่ระบบ'}</Button><Button type="button" variant="outline" disabled={busy} onClick={close}>ยกเลิก</Button></div>
 </form></DialogContent></Dialog>}
// Password change. Forced after a temporary password: the dialog cannot be dismissed, only completed or signed out of.
export function ChangePassword({forced,close,done,logout}:{forced:boolean;close:()=>void;done:()=>Promise<unknown>;logout:()=>void}){
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setErr('');setBusy(true);try{if(next!==confirm)throw new Error('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');if(next===current)throw new Error('รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม');await post('/api/auth',{action:'password',current,next});await done();close()}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}
 return <Dialog open onOpenChange={v=>!v&&!forced&&!busy&&close()}><DialogContent className="modal" showCloseButton={!forced} onEscapeKeyDown={e=>forced&&e.preventDefault()} onPointerDownOutside={e=>forced&&e.preventDefault()}><DialogTitle>{forced?'ตั้งรหัสผ่านของคุณ':'เปลี่ยนรหัสผ่าน'}</DialogTitle><DialogDescription>{forced?'คุณเข้าด้วยรหัสชั่วคราว ต้องตั้งรหัสผ่านใหม่ก่อนใช้งานอื่น':'เมื่อเปลี่ยนแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบอยู่จะต้องเข้าใหม่'}</DialogDescription><form className="form-stack" onSubmit={submit}>
  <Field label={forced?'รหัสชั่วคราว':'รหัสผ่านปัจจุบัน'}><input type="password" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} maxLength={128} required autoFocus/></Field>
  <Field label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"><input type="password" autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)} minLength={8} maxLength={128} required/></Field>
  <Field label="ยืนยันรหัสผ่านใหม่"><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} maxLength={128} required/></Field>
  {err&&<p className="error" role="alert">{err}</p>}
  <div className="actions"><Button type="submit" disabled={busy}>{busy?'กำลังบันทึก…':'บันทึกรหัสผ่าน'}</Button>{forced?<Button type="button" variant="outline" disabled={busy} onClick={logout}>ออกจากระบบ</Button>:<Button type="button" variant="outline" disabled={busy} onClick={close}>ยกเลิก</Button>}</div>
 </form></DialogContent></Dialog>}
