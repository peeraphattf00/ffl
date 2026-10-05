import {z} from 'zod';
import {db,digest,originCheck,json,owner,readState} from '@/lib/server';
import {login,startSession,clearCookie,sessionToken,failure,HttpError,hashPassword,newPassword,username,unique,session,checkPassword,userKey,ipKey,assertNotLimited,recordFailure,LIMITS} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 originCheck(req);if(Number(req.headers.get('content-length')||0)>4000)return json({error:'ข้อมูลใหญ่เกินไป'},413);const b=z.record(z.unknown()).parse(await req.json());
 if(b.action==='login'){const id=await login(req,z.string().trim().min(1).max(30).parse(b.username),z.string().min(1).max(128).parse(b.password));return json({ok:true},200,{'Set-Cookie':await startSession(req,id)})}
 if(b.action==='logout'){const token=sessionToken(req);if(token)await db().prepare('DELETE FROM sessions WHERE id=?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':clearCookie})}
 if(b.action==='bootstrap'){
 // First admin only: the verified Site owner, once, while no admin exists. The owner chooses the profile (KEVIN by default) and sets the password.
 if(!owner(req))throw new HttpError(403,'เฉพาะเจ้าของเว็บไซต์ที่ยืนยันตัวตนด้วย ChatGPT เท่านั้น');
 if(await db().prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").first())throw new HttpError(403,'มีผู้ดูแลระบบแล้ว');
 const name=username.parse(b.username),password=newPassword.parse(b.password),profileId=z.string().min(1).max(100).parse(b.profileId);
 if(!(await readState()).state.profiles.some(p=>p.id===profileId))throw new HttpError(400,'ไม่พบโปรไฟล์ผู้เล่น');
 const id=crypto.randomUUID(),{hash,salt}=await hashPassword(password);
 const r=await db().prepare("INSERT INTO users (id,username,profile_id,role,hash,salt,must_change_password,disabled,created_at) SELECT ?,?,?,'admin',?,?,0,0,? WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin')").bind(id,name,profileId,hash,salt,Date.now()).run().catch(e=>{throw unique(e)});
 if(!r.meta.changes)throw new HttpError(403,'มีผู้ดูแลระบบแล้ว');
 return json({ok:true},200,{'Set-Cookie':await startSession(req,id)})}
 if(b.action==='password'){
 // Allowed while must_change_password is set (it is the only thing such a session can do besides logout).
 const s=await session(req);if(!s||s.me.legacy)throw new HttpError(401,'กรุณาเข้าสู่ระบบด้วยบัญชีของคุณ');const me=s.me;
 const current=z.string().min(1).max(128).parse(b.current),next=newPassword.parse(b.next);
 const key=await userKey(me.username,await ipKey(req));await assertNotLimited([key,LIMITS.user]);
 const row=(await db().prepare('SELECT hash,salt FROM users WHERE id=?').bind(me.id).first<{hash:string;salt:string}>())!;
 if(!await checkPassword(current,row.salt,row.hash)){await recordFailure(key);throw new HttpError(400,'รหัสผ่านปัจจุบันไม่ถูกต้อง')}
 if(next===current)throw new HttpError(400,'รหัสผ่านใหม่ต้องไม่ซ้ำรหัสผ่านเดิม');
 const {hash,salt}=await hashPassword(next);
 await db().batch([db().prepare('UPDATE users SET hash=?,salt=?,must_change_password=0 WHERE id=?').bind(hash,salt,me.id),db().prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(me.id,s.id)]);
 return json({ok:true})}
 return json({error:'คำสั่งไม่ถูกต้อง'},400);
 }catch(e){return failure(e)}}
