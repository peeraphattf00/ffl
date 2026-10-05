"use client";
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {UserPlus,KeyRound,Copy,Check,ShieldCheck,ShieldOff,Ban,CircleCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {toast} from 'sonner';
import type {User} from '@/lib/auth';
import type {Profile} from '@/lib/league';
import {Badge,type Data} from './league';
import {post} from './account';
type Confirm={title:string;description:string;action:()=>Promise<void>};
async function fetchUsers(){const r=await fetch('/api/users',{cache:'no-store'});const d=await r.json() as {users:User[];error?:string};if(!r.ok)throw new Error(d.error);return d.users}
const status=(u:User)=>u.disabled?'ปิดใช้งาน':u.mustChangePassword?'รอเปลี่ยนรหัสผ่าน':'ใช้งาน';
// Admin-only tab: one row per league profile (a member is a profile), showing its account if it has one.
// Profiles without an account get "เปิดบัญชี"; accounts can be reset, disabled/enabled and promoted/demoted. Temporary passwords are shown once.
export default function Members({data}:{data:Data}){
 const [users,setUsers]=useState<User[]|null>(null),[error,setError]=useState(''),[confirm,setConfirm]=useState<Confirm|null>(null),[creating,setCreating]=useState<Profile|null>(null),[temp,setTemp]=useState<{username:string;password:string}|null>(null),[busy,setBusy]=useState(false);
 const load=useCallback(()=>fetchUsers().then(u=>{setUsers(u);setError('')},e=>setError((e as Error).message)),[]);
 useEffect(()=>{let live=true;fetchUsers().then(u=>{if(live)setUsers(u)},e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[]);
 const me=data.me,profiles=data.state.profiles,account=(p:Profile)=>users?.find(u=>u.profileId===p.id);
 const orphans=users?.filter(u=>!profiles.some(p=>p.id===u.profileId))||[],linked=profiles.filter(p=>account(p)).length;
 async function act(body:Record<string,unknown>,okText:string){setBusy(true);try{const d=await post('/api/users',body) as {users:User[];password?:string};setUsers(d.users);if(d.password){const u=d.users.find(x=>x.id===body.id||x.username===body.username);setTemp({username:u?.username||String(body.username),password:d.password})}else toast.success(okText)}finally{setBusy(false)}}
 const ask=(c:Confirm)=>setConfirm(c);
 const manage=(u:User,self:boolean)=><div className="actions">
  <Button size="sm" variant="outline" disabled={busy} onClick={()=>ask({title:`รีเซ็ตรหัสผ่านของ ${u.username}?`,description:'ระบบจะสุ่มรหัสชั่วคราวใหม่ อุปกรณ์ที่เข้าสู่ระบบอยู่จะหลุดทั้งหมด และต้องตั้งรหัสใหม่เมื่อเข้าครั้งถัดไป',action:()=>act({action:'reset',id:u.id},'')})}><KeyRound size={14}/> รีเซ็ตรหัส</Button>
  <Button size="sm" variant="ghost" disabled={busy} onClick={()=>ask(u.role==='admin'?{title:`ลดสิทธิ์ ${u.username} เป็นสมาชิก?`,description:self?'คุณจะจัดการสมาชิกไม่ได้อีก จนกว่าผู้ดูแลคนอื่นจะคืนสิทธิ์ให้':'จะจัดการบัญชีสมาชิกไม่ได้ แต่ยังแก้ไขข้อมูลลีกได้เหมือนเดิม',action:()=>act({action:'role',id:u.id,role:'member'},'ลดสิทธิ์แล้ว')}:{title:`ตั้ง ${u.username} เป็นผู้ดูแลระบบ?`,description:'จะสร้าง รีเซ็ต และปิดบัญชีของทุกคนได้',action:()=>act({action:'role',id:u.id,role:'admin'},'ตั้งเป็นผู้ดูแลแล้ว')})}>{u.role==='admin'?<><ShieldOff size={14}/> ลดสิทธิ์</>:<><ShieldCheck size={14}/> ตั้งเป็นผู้ดูแล</>}</Button>
  <Button size="sm" variant="ghost" className={u.disabled?'':'danger'} disabled={busy} onClick={()=>ask(u.disabled?{title:`เปิดใช้งาน ${u.username}?`,description:'เข้าสู่ระบบได้อีกครั้งด้วยรหัสผ่านเดิม',action:()=>act({action:'disable',id:u.id,disabled:false},'เปิดใช้งานแล้ว')}:{title:`ปิดใช้งาน ${u.username}?`,description:'จะเข้าสู่ระบบไม่ได้และหลุดจากทุกอุปกรณ์ทันที ประวัติการแก้ไขยังอยู่ครบ',action:()=>act({action:'disable',id:u.id,disabled:true},'ปิดใช้งานแล้ว')})}>{u.disabled?<><CircleCheck size={14}/> เปิดใช้งาน</>:<><Ban size={14}/> ปิดใช้งาน</>}</Button>
 </div>;
 return <><div className="section-title"><div><p className="eyebrow">MEMBERS</p><h2>สมาชิก</h2></div>{users&&<span className="muted-text">มีบัญชีแล้ว {linked} / {profiles.length} คน</span>}</div>
  <p className="muted">สมาชิก 1 คนคือ 1 โปรไฟล์ผู้เล่น กด &quot;เปิดบัญชี&quot; ให้เพื่อนที่ยังไม่มีบัญชี ระบบจะสุ่มรหัสชั่วคราวให้ เพื่อนต้องตั้งรหัสผ่านของตัวเองเมื่อเข้าครั้งแรก · เพิ่มเพื่อนใหม่ได้ที่แท็บโปรไฟล์</p>
  {error&&<div className="error">{error} <Button variant="outline" onClick={load}>ลองใหม่</Button></div>}
  <div className="panel">{users?<>{profiles.map(p=>{const u=account(p),self=!!u&&me?.id===u.id;return <div className="list-row" key={p.id}><div className="player"><Badge p={p}/><div><strong>{p.name}{self&&' (คุณ)'}</strong>
    {u?<small>@{u.username} · {u.role==='admin'?'ผู้ดูแลระบบ':'สมาชิก'} · <span className={u.disabled?'danger':u.mustChangePassword?'gold':''}>{status(u)}</span></small>:<small>{p.active?'ยังไม่มีบัญชี':'ยังไม่มีบัญชี · โปรไฟล์ปิดใช้งาน'}</small>}</div></div>
    {u?manage(u,self):<div className="actions"><Button size="sm" disabled={busy||!p.active} title={p.active?undefined:'เปิดใช้งานโปรไฟล์ในแท็บโปรไฟล์ก่อน'} onClick={()=>setCreating(p)}><UserPlus size={14}/> เปิดบัญชี</Button></div>}</div>})}
   {orphans.map(u=><div className="list-row" key={u.id}><div className="player"><Badge/><div><strong>@{u.username}</strong><small>ไม่พบโปรไฟล์ที่ผูกไว้ · {status(u)}</small></div></div>{manage(u,me?.id===u.id)}</div>)}</>
  :!error&&<p className="muted padded">กำลังโหลด…</p>}</div>
  {creating&&<Create profile={creating} close={()=>setCreating(null)} create={async username=>{await act({action:'create',username,profileId:creating.id},'');setCreating(null)}}/>}
  {temp&&<TempPassword {...temp} close={()=>setTemp(null)}/>}
  <AlertDialog open={!!confirm} onOpenChange={open=>!open&&setConfirm(null)}><AlertDialogContent><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.description}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={()=>confirm&&confirm.action().catch(e=>toast.error((e as Error).message))}>ยืนยัน</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </>}
// Opens an account for one profile; the username is suggested from the profile name and can be changed.
const suggest=(name:string)=>{const u=name.toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,30);return u.length>=3?u:''};
function Create({profile,close,create}:{profile:Profile;close:()=>void;create:(username:string)=>Promise<void>}){
 const [username,setUsername]=useState(suggest(profile.name)),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setErr('');setBusy(true);try{await create(username)}catch(e){setErr((e as Error).message)}finally{setBusy(false)}}
 return <Dialog open onOpenChange={v=>!v&&!busy&&close()}><DialogContent className="modal"><DialogTitle>เปิดบัญชีให้ {profile.name}</DialogTitle><DialogDescription>ระบบจะสุ่มรหัสชั่วคราวให้ ส่งให้เจ้าของโปรไฟล์เพื่อเข้าครั้งแรก</DialogDescription><form className="form-stack" onSubmit={submit}>
  <div className="player"><Badge p={profile}/><div><strong>{profile.name}</strong><small>{profile.team||'ยังไม่ระบุชื่อทีม'}</small></div></div>
  <label className="field">ชื่อผู้ใช้สำหรับเข้าสู่ระบบ (a–z, 0–9 และ . _ -)<input autoCapitalize="none" spellCheck={false} value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={30} pattern="[A-Za-z0-9._-]+" required autoFocus/></label>
  {err&&<p className="error" role="alert">{err}</p>}
  <div className="actions"><Button type="submit" disabled={busy}>{busy?'กำลังสร้าง…':'เปิดบัญชี'}</Button><Button type="button" variant="outline" disabled={busy} onClick={close}>ยกเลิก</Button></div>
 </form></DialogContent></Dialog>}
// Shown once. Closing requires copying it or ticking that it was noted, because the server keeps only its hash.
function TempPassword({username,password,close}:{username:string;password:string;close:()=>void}){
 const [copied,setCopied]=useState(false),[saved,setSaved]=useState(false);
 async function copy(){try{await navigator.clipboard.writeText(password);setCopied(true);setSaved(true)}catch{toast.error('คัดลอกไม่สำเร็จ กรุณาจดรหัสด้วยตัวเอง')}}
 return <Dialog open onOpenChange={v=>!v&&saved&&close()}><DialogContent className="modal" showCloseButton={false} onEscapeKeyDown={e=>!saved&&e.preventDefault()} onPointerDownOutside={e=>e.preventDefault()}><DialogTitle>รหัสชั่วคราวของ {username}</DialogTitle><DialogDescription>ส่งรหัสนี้ให้เจ้าของบัญชี เขาต้องตั้งรหัสผ่านใหม่เมื่อเข้าครั้งแรก</DialogDescription><div className="form-stack">
  <p className="score" style={{fontFamily:'ui-monospace,Consolas,monospace',textAlign:'center',userSelect:'all',wordBreak:'break-all'}}>{password}</p>
  <p className="error">ปิดหน้าต่างนี้แล้วจะดูรหัสนี้อีกไม่ได้ ถ้าลืมต้องรีเซ็ตใหม่</p>
  <label className="check-row"><Checkbox checked={saved} onCheckedChange={v=>setSaved(v===true)}/> จดหรือส่งรหัสนี้แล้ว</label>
  <div className="actions"><Button onClick={copy}>{copied?<><Check size={16}/> คัดลอกแล้ว</>:<><Copy size={16}/> คัดลอกรหัส</>}</Button><Button variant="outline" disabled={!saved} onClick={close}>เสร็จแล้ว</Button></div>
 </div></DialogContent></Dialog>}
