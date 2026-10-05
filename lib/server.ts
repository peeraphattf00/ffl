import {env} from 'cloudflare:workers';
import {initialState,type LeagueState} from './league';
import {pushLine,type LineResult} from './line';
export function db(){if(!env.DB)throw new Error('ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่');return env.DB}
// LINE_API_BASE only points tests at a fake LINE server; production leaves it unset.
export function lineConfig(){return env.LINE_CHANNEL_TOKEN&&env.LINE_GROUP_ID?{token:env.LINE_CHANNEL_TOKEN,to:env.LINE_GROUP_ID,api:env.LINE_API_BASE||undefined}:null}
// Call only after saveState. A correction goes out only if this match already had a result delivered to LINE; every attempt is logged in line_notifications. Never throws.
export async function notifyLine(text:string,eventId:string,matchId:string,correction:boolean):Promise<LineResult>{
 const line=lineConfig();if(!line)return 'off';
 try{if(correction&&!await db().prepare("SELECT 1 FROM line_notifications WHERE match_id=? AND status='sent' LIMIT 1").bind(matchId).first())return 'off'}catch(e){console.error('LINE log read failed',e);return 'failed'}
 const result=await pushLine({...line,text,retryKey:eventId});
 try{await db().prepare('INSERT OR REPLACE INTO line_notifications (event_id,match_id,status,sent_at) VALUES (?,?,?,?)').bind(eventId,matchId,result,Date.now()).run()}catch(e){console.error('LINE log write failed',e)}
 return result;
}
export function bucket(){if(!env.BUCKET)throw new Error('พื้นที่เก็บรูปยังไม่พร้อม');return env.BUCKET}
export async function readState(){await db().prepare('INSERT OR IGNORE INTO league (id,payload,version) VALUES (?,?,0)').bind('main',JSON.stringify(initialState())).run();const row=await db().prepare('SELECT payload,version FROM league WHERE id=?').bind('main').first<{payload:string;version:number}>();return {state:JSON.parse(row!.payload) as LeagueState,version:row!.version}}
export async function saveState(state:LeagueState,version:number){const r=await db().prepare('UPDATE league SET payload=?,version=version+1 WHERE id=? AND version=?').bind(JSON.stringify(state),'main',version).run();if(!r.meta.changes)throw new Error('ข้อมูลเปลี่ยนโดยผู้ใช้อื่น กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่')}
export async function digest(s:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function owner(req:Request){return req.headers.get('oai-authenticated-user-email')==='basic0407@gmail.com'||(new URL(req.url).hostname==='localhost'&&req.headers.get('oai-authenticated-user-id')==='local_seedy')}
export function originCheck(req:Request){const origin=req.headers.get('origin');if(!origin||new URL(origin).host!==new URL(req.url).host)throw new Error('คำขอไม่ถูกต้อง กรุณาเปิดผ่านเว็บไซต์')}
export function json(data:unknown,status=200,headers:Record<string,string>={}){return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}})}
