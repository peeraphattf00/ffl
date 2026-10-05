import type {LeagueState,Match,History,standings} from './league';
export type LineResult='off'|'sent'|'failed';
type Table=ReturnType<typeof standings>;
type Score=[number|null,number|null];
const fmt=([h,a]:Score)=>`${h}–${a}`,scored=([h]:Score)=>h!==null;
// Deliberately does not say who recorded or edited the result (decided 2026-10-05).
function message(s:LeagueState,m:Match,table:Table,title:string,score:Score,note?:string){
 const club=(p:{name:string;team:string})=>p.team?`${p.name} (${p.team})`:p.name;
 const player=(id:string)=>{const p=s.profiles.find(x=>x.id===id);return p?club(p):'?'};
 const comp=s.competitions.find(c=>c.id===m.competitionId),season=s.seasons.find(x=>x.id===comp?.seasonId)?.name;
 const lines=[title,`📋 ${[comp?.name??'FC Friends League',season].filter(Boolean).join(' · ')}`,`${player(m.home)} ${fmt(score)} ${player(m.away)}`];
 if(note)lines.push(note);
 if(table.length)lines.push('',`🏆 อันดับ${season?` ${season}`:''}`,...table.slice(0,4).map((r,i)=>`${i+1}. ${club(r.profile)} ${r.points} แต้ม`));
 return lines.join('\n');
}
// A recorded score (new or edited) — event.after always holds a score here.
export const scoreMessage=(s:LeagueState,m:Match,event:History,table:Table)=>message(s,m,table,'⚽ บันทึกผล',event.after,scored(event.before)?`(แก้จาก ${fmt(event.before)})`:undefined);
// Undo, clear or restore of a match whose result already reached LINE: cancelled (after is empty) or changed to another score.
export const correctionMessage=(s:LeagueState,m:Match,event:History,table:Table)=>scored(event.after)
 ?message(s,m,table,'✏️ แก้ผล',event.after,scored(event.before)?`(จาก ${fmt(event.before)})`:undefined)
 :message(s,m,table,'↩️ ยกเลิกผล',event.before);
export async function pushLine({token,to,text,retryKey,api='https://api.line.me',fetchImpl=fetch}:{token:string;to:string;text:string;retryKey:string;api?:string;fetchImpl?:typeof fetch}):Promise<LineResult>{
 try{const r=await fetchImpl(`${api}/v2/bot/message/push`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Line-Retry-Key':retryKey},body:JSON.stringify({to,messages:[{type:'text',text}]}),signal:AbortSignal.timeout(5000)});
 if(r.ok||r.status===409)return 'sent';console.error('LINE push failed',r.status,await r.text().catch(()=>''));return 'failed'}
 catch(e){console.error('LINE push failed',e);return 'failed'}
}
export async function verifySignature(body:string,signature:string|null,secret:string){
 if(!signature)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))));
 return mac.length===signature.length&&[...mac].reduce((d,c,i)=>d|(c.charCodeAt(0)^signature.charCodeAt(i)),0)===0;
}
