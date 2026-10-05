import {z} from 'zod';
import {db,readState,saveState,owner,originCheck,json,bucket} from '@/lib/server';
import {session,requireEditor,actor,failure,HttpError,type Me} from '@/lib/auth';
import {can,isAction} from '@/lib/permissions';
import {fixtures,type Profile} from '@/lib/league';
export const dynamic='force-dynamic';
const name=z.string().trim().min(1).max(60), id=z.string().min(1).max(100),score=z.number().int().min(0).max(99).nullable();
export async function GET(req:Request){try{const data=await readState();const hasAdmin=!!await db().prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();const me:Me|null=(await session(req))?.me??null;return json({...data,me,authenticated:!!me&&!me.mustChangePassword,hasAdmin,setupAllowed:owner(req)})}catch(e){console.error(e);return json({error:'โหลดข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง'},503)}}
export async function POST(req:Request){try{
 originCheck(req);if(Number(req.headers.get('content-length')||0)>20000)return json({error:'ข้อมูลใหญ่เกินไป'},413);const b=z.record(z.unknown()).parse(await req.json());
 const me=await requireEditor(req);
 const {state:s,version}=await readState();
 // Permissions (lib/permissions.ts) are checked before the version check and before saveState, so a refused request never changes the version.
 const p=b.action==='profile'?z.object({id:id.optional(),name,team:z.string().trim().max(60),badge:z.string().max(150),active:z.boolean()}).parse(b.profile):undefined;
 if(isAction(b.action)){const v=can(me,b.action,p&&{id:p.id,active:p.active,current:s.profiles.find(x=>x.id===p.id)});if(!v.ok)throw new HttpError(403,v.reason)}
 if(b.version!==version)return json({error:'เพื่อนเพิ่งแก้ไขข้อมูล กรุณาโหลดล่าสุดก่อนบันทึก'},409);
 let eventId:string|undefined;
 if(p){
 if(p.badge&&!/^badges\/[0-9a-f-]+\.(png|jpg|webp)$/.test(p.badge))throw new Error('รูปไม่ถูกต้อง');if(p.badge&&!await bucket().head(p.badge))throw new Error('ไม่พบรูป กรุณาอัปโหลดใหม่');if(s.profiles.some(x=>x.name.toLowerCase()===p.name.toLowerCase()&&x.id!==p.id))throw new Error('มีชื่อผู้เล่นนี้แล้ว');const old=s.profiles.find(x=>x.id===p.id);if(p.id&&!old)throw new Error('ไม่พบผู้เล่น');if(old)Object.assign(old,p);else s.profiles.push({...p,id:crypto.randomUUID()} as Profile);
 }else if(b.action==='season'){
 const n=name.parse(b.name);if(b.id){const season=s.seasons.find(x=>x.id===b.id);if(!season)throw new Error('ไม่พบฤดูกาล');season.name=n;if(b.current)s.currentSeason=season.id}else{const sid=crypto.randomUUID();s.seasons.push({id:sid,name:n});if(b.current)s.currentSeason=sid}
 }else if(b.action==='competition'){
 const c=z.object({id:id.optional(),name,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),seasonId:id,players:z.array(id).min(2).max(64),legs:z.union([z.literal(1),z.literal(2)])}).parse(b.competition);if(new Set(c.players).size!==c.players.length||!s.seasons.some(x=>x.id===c.seasonId)||c.players.some(pid=>!s.profiles.some(p=>p.id===pid)))throw new Error('ข้อมูลผู้เล่นหรือฤดูกาลไม่ถูกต้อง');const old=s.competitions.find(x=>x.id===c.id);if(c.id&&!old)throw new Error('ไม่พบโปรแกรม');const changed=old&&(JSON.stringify([...old.players].sort())!==JSON.stringify([...c.players].sort())||old.legs!==c.legs||old.seasonId!==c.seasonId);if(changed&&s.matches.some(m=>m.competitionId===old.id&&(m.revision>0)))throw new Error('โปรแกรมมีประวัติผลแล้ว เปลี่ยนผู้เข้าร่วมหรือรูปแบบไม่ได้ กรุณาสร้างโปรแกรมใหม่');if(c.players.some(pid=>!s.profiles.find(p=>p.id===pid)!.active&&!old?.players.includes(pid)))throw new Error('เลือกเฉพาะผู้เล่นที่เปิดใช้งาน');if(old){Object.assign(old,c);if(changed){s.matches=s.matches.filter(m=>m.competitionId!==old.id);s.matches.push(...fixtures(c.players,c.legs,old.id))}}else{const cid=crypto.randomUUID();s.competitions.push({...c,id:cid,archived:false});s.matches.push(...fixtures(c.players,c.legs,cid))}
 }else if(b.action==='archive'){
 const c=s.competitions.find(x=>x.id===b.id);if(!c)throw new Error('ไม่พบโปรแกรม');c.archived=z.boolean().parse(b.archived);
 }else if(b.action==='score'||b.action==='restore'){
 const m=s.matches.find(x=>x.id===b.id);if(!m)throw new Error('ไม่พบคู่แข่งขัน');if(s.competitions.find(c=>c.id===m.competitionId)?.archived)throw new Error('กู้คืนโปรแกรมก่อนแก้ไขผล');let hs=score.parse(b.hs??null),as=score.parse(b.as??null);
 if(b.action==='restore'){const event=s.history.find(h=>h.id===b.eventId&&h.matchId===m.id);if(!event)throw new Error('ไม่พบประวัติ');if(b.undo&&(event.revision!==m.revision||Date.now()-Date.parse(event.time)>30000))throw new Error('Undo หมดเวลาหรือมีผลใหม่แล้ว ใช้ประวัติเพื่อคืนค่าแทน');[hs,as]=event.before}
 if((hs===null)!==(as===null))throw new Error('กรุณาระบุสกอร์ทั้งสองทีม');if(m.hs===hs&&m.as===as)throw new Error('ผลไม่เปลี่ยนแปลง');eventId=crypto.randomUUID();s.history.unshift({id:eventId,matchId:m.id,before:[m.hs,m.as],after:[hs,as],time:new Date().toISOString(),revision:m.revision+1,kind:b.action==='restore'?'คืนค่า':hs===null?'ล้างผล':'บันทึกผล',by:actor(me)});m.hs=hs;m.as=as;m.revision++;
 }else throw new Error('คำสั่งไม่ถูกต้อง');
 await saveState(s,version);return json({ok:true,eventId});
 }catch(e){return failure(e)}}
