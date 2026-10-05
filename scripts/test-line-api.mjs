// LINE notifications end to end: the built Worker on a throwaway D1 talks to a fake LINE API on localhost (run `npm run build` first). Never calls LINE.
import assert from 'node:assert/strict';
import http from 'node:http';
import {startServer,steps,OWNER} from './test-server.mjs';
const linePort=Number(process.env.TEST_LINE_PORT||8799),pushes=[];let lineStatus=200;
const fakeLine=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{pushes.push({url:req.url,auth:req.headers.authorization,retryKey:req.headers['x-line-retry-key'],...JSON.parse(body)});res.writeHead(lineStatus,{'Content-Type':'application/json'}).end('{}')})});
await new Promise(ok=>fakeLine.listen(linePort,'localhost',ok));
const server=await startServer({port:Number(process.env.TEST_PORT||8793),vars:{LINE_CHANNEL_TOKEN:'test-token',LINE_GROUP_ID:'Ctest',LINE_API_BASE:`http://localhost:${linePort}`}});
const last=()=>pushes.at(-1),text=()=>last().messages[0].text;
try{await steps(server,async step=>{
 const c=new server.Client();let d,m1,m2;
 const history=(match,after)=>d.state.history.find(h=>h.matchId===match.id&&h.after[0]===after[0]&&h.after[1]===after[1]);
 await step('setup',async()=>{await c.req('/api/auth',{action:'bootstrap',username:'qa-line',password:crypto.randomUUID(),profileId:'player-1'},{headers:OWNER});d=await c.league();
  await c.edit({action:'competition',competition:{name:'ทดสอบ LINE · ไม่ใช่ผลจริง',date:'2026-10-05',seasonId:'season-1',players:d.state.profiles.map(p=>p.id),legs:1}});d=await c.league();[m1,m2]=d.state.matches});
 await step('a recorded score is pushed with retry key = event id',async()=>{const r=await c.edit({action:'score',id:m1.id,hs:2,as:1});assert.equal(r.line,'sent');assert.equal(pushes.length,1);
  assert.equal(last().url,'/v2/bot/message/push');assert.equal(last().auth,'Bearer test-token');assert.equal(last().to,'Ctest');assert.equal(last().retryKey,r.eventId);assert.ok(text().startsWith('⚽ บันทึกผล\n📋 ทดสอบ LINE · ไม่ใช่ผลจริง · Season 01'));assert.ok(text().includes('2–1'))});
 await step('undo of a delivered result sends one correction',async()=>{d=await c.league();const r=await c.edit({action:'restore',id:m1.id,eventId:history(m1,[2,1]).id,undo:true});assert.equal(r.line,'sent');assert.equal(pushes.length,2);assert.equal(last().retryKey,r.eventId);assert.ok(text().startsWith('↩️ ยกเลิกผล'));assert.ok(text().includes('2–1'))});
 await step('LINE down: the save still succeeds and a never-delivered result is not corrected',async()=>{lineStatus=500;const r=await c.edit({action:'score',id:m2.id,hs:1,as:0});assert.equal(r.line,'failed');assert.equal(pushes.length,3);lineStatus=200;
  d=await c.league();assert.equal(d.state.matches.find(x=>x.id===m2.id).hs,1);const u=await c.edit({action:'restore',id:m2.id,eventId:history(m2,[1,0]).id,undo:true});assert.equal(u.line,'off');assert.equal(pushes.length,3)});
 await step('every restore of a delivered match sends a correction',async()=>{await c.edit({action:'score',id:m1.id,hs:3,as:0});await c.edit({action:'score',id:m1.id,hs:1,as:1});assert.ok(text().includes('(แก้จาก 3–0)'));assert.equal(pushes.length,5);d=await c.league();
  let r=await c.edit({action:'restore',id:m1.id,eventId:history(m1,[1,1]).id});assert.equal(r.line,'sent');assert.ok(text().startsWith('✏️ แก้ผล'));assert.ok(text().includes('3–0'));assert.ok(text().includes('(จาก 1–1)'));
  d=await c.league();r=await c.edit({action:'restore',id:m1.id,eventId:d.state.history.find(h=>h.matchId===m1.id&&h.kind==='บันทึกผล'&&h.after[0]===3&&h.before[0]===null).id});assert.equal(r.line,'sent');assert.ok(text().startsWith('↩️ ยกเลิกผล'));assert.ok(text().includes('3–0'));assert.equal(pushes.length,7)});
 await step('clearing a delivered result sends a correction',async()=>{await c.edit({action:'score',id:m1.id,hs:2,as:2});const r=await c.edit({action:'score',id:m1.id,hs:null,as:null});assert.equal(r.line,'sent');assert.ok(text().startsWith('↩️ ยกเลิกผล'));assert.ok(text().includes('2–2'));assert.equal(pushes.length,9)});
 await step('every push names who did it',async()=>{assert.ok(pushes.every(p=>p.messages[0].text.includes('✍️ ')))});
})}finally{fakeLine.close()}
