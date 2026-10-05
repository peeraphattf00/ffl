import {z} from 'zod';
import {db,digest,passwordHash,json} from './server';
export type Role='admin'|'member';
export type User={id:string;username:string;profileId:string;role:Role;mustChangePassword:boolean;disabled:boolean;createdAt:number};
// A legacy session comes from the shared password (sessions.user_id IS NULL) and stays valid until the shared password is retired.
export type Me={legacy:true}|{legacy:false;id:string;username:string;role:Role;profileId:string;mustChangePassword:boolean};
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
const TTL=43200000,WINDOW=900000,DUMMY_HASH='0'.repeat(64);
export const LIMITS={user:5,ip:20,legacy:10};
export const userColumns='id,username,profile_id AS profileId,role,must_change_password AS mustChangePassword,disabled,created_at AS createdAt';
export const toUser=(r:Record<string,unknown>):User=>({...r,mustChangePassword:!!r.mustChangePassword,disabled:!!r.disabled} as User);
export function sessionToken(req:Request){return req.headers.get('cookie')?.match(/(?:^|;\s*)ffl_session=([^;]+)/)?.[1]}
export async function session(req:Request):Promise<{id:string;me:Me}|null>{const token=sessionToken(req);if(!token)return null;const id=await digest(token);const r=await db().prepare('SELECT s.user_id AS userId,u.username,u.role,u.profile_id AS profileId,u.must_change_password AS mustChangePassword,u.disabled FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?').bind(id,Date.now()).first<{userId:string|null;username:string|null;role:Role;profileId:string;mustChangePassword:number;disabled:number}>();if(!r)return null;if(r.userId===null)return {id,me:{legacy:true}};if(r.username===null||r.disabled)return null;return {id,me:{legacy:false,id:r.userId,username:r.username,role:r.role,profileId:r.profileId,mustChangePassword:!!r.mustChangePassword}}}
// Every write goes through here: a session is required and an account must have replaced its temporary password.
export async function requireEditor(req:Request){const s=await session(req);if(!s)throw new HttpError(401,'กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล');if(!s.me.legacy&&s.me.mustChangePassword)throw new HttpError(403,'กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน');return s.me}
export async function requireAdmin(req:Request){const me=await requireEditor(req);if(me.legacy||me.role!=='admin')throw new HttpError(403,'เฉพาะผู้ดูแลระบบเท่านั้น');return me}
export const actor=(me:Me)=>me.legacy?'legacy':me.profileId;
export async function startSession(req:Request,userId:string|null){const token=crypto.randomUUID()+crypto.randomUUID(),now=Date.now();await db().batch([db().prepare('INSERT INTO sessions (id,expires,user_id) VALUES (?,?,?)').bind(await digest(token),now+TTL,userId),db().prepare('DELETE FROM sessions WHERE expires<?').bind(now)]);return `ffl_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${new URL(req.url).protocol==='https:'?'; Secure':''}`}
export const clearCookie='ffl_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
function same(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
export async function checkPassword(password:string,salt:string,hash:string){return same(await passwordHash(password,salt),hash)}
export async function hashPassword(password:string){const salt=crypto.randomUUID();return {salt,hash:await passwordHash(password,salt)}}
export const newPassword=z.string().min(8,'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร').max(128);
export const username=z.string().trim().min(3,'ชื่อผู้ใช้ต้องมี 3–30 ตัวอักษร').max(30,'ชื่อผู้ใช้ต้องมี 3–30 ตัวอักษร').regex(/^[A-Za-z0-9._-]+$/,'ชื่อผู้ใช้ใช้ได้เฉพาะ a–z, 0–9 และ . _ -');
// Rate limiting counts failures only. Keys: `u:<user>:<ip>` per username and address, `ip:<ip>` across usernames, `legacy:<ip>` for the shared password.
export async function ipKey(req:Request){return digest(req.headers.get('cf-connecting-ip')||'local')}
export async function userKey(name:string,ip?:string){return `u:${await digest(name.trim().toLowerCase())}:${ip??''}`}
export async function assertNotLimited(...checks:[string,number][]){for(const [id,limit] of checks){const r=await db().prepare('SELECT count FROM attempts WHERE id=? AND reset>?').bind(id,Date.now()).first<{count:number}>();if((r?.count??0)>=limit)throw new HttpError(429,'ลองหลายครั้งเกินไป กรุณารอ 15 นาที')}}
export async function recordFailure(...ids:string[]){const now=Date.now();await db().batch(ids.map(id=>db().prepare('INSERT INTO attempts (id,count,reset) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset<? THEN 1 ELSE count+1 END,reset=CASE WHEN reset<? THEN ? ELSE reset END').bind(id,now+WINDOW,now,now,now+WINDOW)))}
export async function clearFailures(prefix:string){await db().prepare("DELETE FROM attempts WHERE substr(id,1,length(?))=?").bind(prefix,prefix).run()}
export async function login(req:Request,name:string,password:string){
 const ip=await ipKey(req),uk=await userKey(name,ip),ik='ip:'+ip;await assertNotLimited([uk,LIMITS.user],[ik,LIMITS.ip]);
 const r=await db().prepare('SELECT id,hash,salt,disabled FROM users WHERE lower(username)=lower(?)').bind(name.trim()).first<{id:string;hash:string;salt:string;disabled:number}>();
 // Hash even for unknown usernames so the response time does not reveal which usernames exist.
 const ok=await checkPassword(password,r?.salt??'unknown-user',r?.hash??DUMMY_HASH);
 if(!r||!ok){await recordFailure(uk,ik);throw new HttpError(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')}
 if(r.disabled)throw new HttpError(403,'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
 await clearFailures(uk);return r.id}
// Temporary passwords: 12 characters without look-alikes (0/O, 1/l/I), shown as xxxx-xxxx-xxxx.
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function tempPassword(){const out:string[]=[];while(out.length<12){for(const b of crypto.getRandomValues(new Uint8Array(16)))if(out.length<12&&b<ALPHABET.length*4)out.push(ALPHABET[b%ALPHABET.length])}return out.join('').replace(/(.{4})(?=.)/g,'$1-')}
// Turn a users UNIQUE violation into a readable 409.
export const unique=(e:unknown)=>e instanceof Error&&/UNIQUE constraint failed: (users\.profile_id|index 'users_username_lower'|users\.username)/.test(e.message)?new HttpError(409,e.message.includes('profile_id')?'โปรไฟล์นี้มีบัญชีแล้ว':'ชื่อผู้ใช้นี้ถูกใช้แล้ว'):e;
export function failure(e:unknown){if(e instanceof HttpError)return json({error:e.message},e.status);console.error(e);if(e instanceof z.ZodError)return json({error:e.issues.find(i=>i.message&&!i.message.startsWith('Expected')&&!i.message.startsWith('Required'))?.message||'กรุณาตรวจข้อมูลให้ครบและถูกต้อง'},400);return json({error:e instanceof Error?e.message:'บันทึกไม่สำเร็จ'},400)}
