import type {LeagueState,Match,History,standings} from './league';
export type LineResult='off'|'sent'|'failed';
type Table=ReturnType<typeof standings>;
const fmt=([h,a]:[number|null,number|null])=>`${h}–${a}`;
export function scoreMessage(s:LeagueState,m:Match,event:History,table:Table){
 const name=(id:string)=>s.profiles.find(p=>p.id===id)?.name??'?';const comp=s.competitions.find(c=>c.id===m.competitionId);
 const lines=[`⚽ บันทึกผล · ${comp?.name??'FC Friends League'}`,`${name(m.home)} ${fmt(event.after)} ${name(m.away)}`];
 if(event.before[0]!==null&&event.before[1]!==null)lines.push(`(แก้จาก ${fmt(event.before)})`);
 if(event.by)lines.push(event.by==='legacy'?'✍️ บันทึกด้วยรหัสกลาง':`✍️ บันทึกโดย ${name(event.by)}`);
 if(table.length)lines.push('','🏆 อันดับ',...table.slice(0,4).map((r,i)=>`${i+1}. ${r.profile.name} ${r.points} แต้ม`));
 return lines.join('\n');
}
export async function pushLine({token,to,text,retryKey,fetchImpl=fetch}:{token:string;to:string;text:string;retryKey:string;fetchImpl?:typeof fetch}):Promise<LineResult>{
 try{const r=await fetchImpl('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Line-Retry-Key':retryKey},body:JSON.stringify({to,messages:[{type:'text',text}]}),signal:AbortSignal.timeout(5000)});
 if(r.ok||r.status===409)return 'sent';console.error('LINE push failed',r.status,await r.text().catch(()=>''));return 'failed'}
 catch(e){console.error('LINE push failed',e);return 'failed'}
}
export async function verifySignature(body:string,signature:string|null,secret:string){
 if(!signature)return false;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))));
 return mac.length===signature.length&&[...mac].reduce((d,c,i)=>d|(c.charCodeAt(0)^signature.charCodeAt(i)),0)===0;
}
