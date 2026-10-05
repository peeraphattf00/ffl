import {z} from 'zod';
import {db,digest,originCheck,json} from '@/lib/server';
import {login,startSession,clearCookie,sessionToken,failure} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 originCheck(req);if(Number(req.headers.get('content-length')||0)>4000)return json({error:'ข้อมูลใหญ่เกินไป'},413);const b=z.record(z.unknown()).parse(await req.json());
 if(b.action==='login'){const id=await login(req,z.string().trim().min(1).max(30).parse(b.username),z.string().min(1).max(128).parse(b.password));return json({ok:true},200,{'Set-Cookie':await startSession(req,id)})}
 if(b.action==='logout'){const token=sessionToken(req);if(token)await db().prepare('DELETE FROM sessions WHERE id=?').bind(await digest(token)).run();return json({ok:true},200,{'Set-Cookie':clearCookie})}
 return json({error:'คำสั่งไม่ถูกต้อง'},400);
 }catch(e){return failure(e)}}
