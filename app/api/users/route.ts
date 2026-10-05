import {z} from 'zod';
import {db,originCheck,json,readState} from '@/lib/server';
import {requireAdmin,failure,HttpError,hashPassword,tempPassword,username,unique,userColumns,toUser,clearFailures,userKey} from '@/lib/auth';
export const dynamic='force-dynamic';
// Admin-only account management. Account rows never leave this route with their hash or salt.
const list=async()=>(await db().prepare(`SELECT ${userColumns} FROM users ORDER BY created_at`).all<Record<string,unknown>>()).results.map(toUser);
export async function GET(req:Request){try{await requireAdmin(req);return json({users:await list()})}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 originCheck(req);if(Number(req.headers.get('content-length')||0)>4000)return json({error:'ข้อมูลใหญ่เกินไป'},413);await requireAdmin(req);const b=z.record(z.unknown()).parse(await req.json());
 if(b.action==='create'){
 const name=username.parse(b.username),profileId=z.string().min(1).max(100).parse(b.profileId);const profile=(await readState()).state.profiles.find(p=>p.id===profileId);
 if(!profile)throw new HttpError(400,'ไม่พบโปรไฟล์ผู้เล่น');if(!profile.active)throw new HttpError(400,'เปิดใช้งานโปรไฟล์ก่อนสร้างบัญชี');
 // The temporary password is returned once and only its hash is stored; the member must replace it at first sign-in.
 const password=tempPassword(),{hash,salt}=await hashPassword(password),id=crypto.randomUUID();
 await db().prepare("INSERT INTO users (id,username,profile_id,role,hash,salt,must_change_password,disabled,created_at) VALUES (?,?,?,'member',?,?,1,0,?)").bind(id,name,profileId,hash,salt,Date.now()).run().catch(e=>{throw unique(e)});
 return json({ok:true,password,users:await list()})}
 const target=await db().prepare(`SELECT ${userColumns} FROM users WHERE id=?`).bind(z.string().min(1).max(100).parse(b.id)).first<Record<string,unknown>>().then(r=>r&&toUser(r));
 if(!target)throw new HttpError(404,'ไม่พบบัญชีผู้ใช้');
 if(b.action==='reset'){
 // New temporary password shown once; every device signed in to that account is signed out and its failed-login counters are cleared.
 const password=tempPassword(),{hash,salt}=await hashPassword(password);
 await db().batch([db().prepare('UPDATE users SET hash=?,salt=?,must_change_password=1 WHERE id=?').bind(hash,salt,target.id),db().prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);
 await clearFailures(await userKey(target.username));
 return json({ok:true,password,users:await list()})}
 return json({error:'คำสั่งไม่ถูกต้อง'},400);
 }catch(e){return failure(e)}}
