import {env} from 'cloudflare:workers';
import {verifySignature} from '@/lib/line';
export const dynamic='force-dynamic';
// ใช้ครั้งเดียวเพื่อดึง groupId: ตั้ง LINE_WEBHOOK=on (เฉพาะบนเครื่อง) เชิญบอทเข้ากลุ่มแล้วดู log — ไม่ตั้ง = 404 เหมือนไม่มี route
export async function POST(req:Request){
 if(env.LINE_WEBHOOK!=='on')return new Response('Not Found',{status:404});
 const body=await req.text();if(!env.LINE_CHANNEL_SECRET||!await verifySignature(body,req.headers.get('x-line-signature'),env.LINE_CHANNEL_SECRET))return new Response('invalid signature',{status:401});
 try{for(const e of (JSON.parse(body) as {events?:{type:string;source?:{type:string;groupId?:string}}[]}).events??[])if(e.source?.type==='group')console.log(`LINE ${e.type} groupId:`,e.source.groupId)}catch(e){console.error(e)}
 return new Response('ok');
}
