import {env} from 'cloudflare:workers';
import {verifySignature} from '@/lib/line';
export const dynamic='force-dynamic';
// ใช้ครั้งเดียวเพื่อดึง groupId: เชิญบอทเข้ากลุ่มแล้วดู log
export async function POST(req:Request){
 const body=await req.text();if(!env.LINE_CHANNEL_SECRET||!await verifySignature(body,req.headers.get('x-line-signature'),env.LINE_CHANNEL_SECRET))return new Response('invalid signature',{status:401});
 try{for(const e of (JSON.parse(body) as {events?:{type:string;source?:{type:string;groupId?:string}}[]}).events??[])if(e.source?.type==='group')console.log(`LINE ${e.type} groupId:`,e.source.groupId)}catch(e){console.error(e)}
 return new Response('ok');
}
