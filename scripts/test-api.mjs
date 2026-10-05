// League API tests against the built Worker on a fresh throwaway D1 (run `npm run build` first). See scripts/test-server.mjs.
import assert from 'node:assert/strict';
import {standings} from '../lib/league.ts';
import {startServer,steps,OWNER} from './test-server.mjs';
const server=await startServer({port:Number(process.env.TEST_PORT||8792)}),{Client,send}=server;
await steps(server,async step=>{
const c=new Client(),password=crypto.randomUUID();let d;
const get=async()=>(d=await c.league());const post=(body,status)=>c.req('/api/league',body,{status});
await step('anonymous cannot edit',async()=>{await get();assert.equal(d.state.profiles.length,4);await post({action:'season',name:'forbidden'},401)});
await step('owner creates the first admin',async()=>{assert.equal(d.hasAdmin,false,'This test only runs against a fresh DB');await c.req('/api/auth',{action:'bootstrap',username:'qa-admin',password,profileId:'player-1'},{headers:OWNER});await get();assert.equal(d.authenticated,true)});
let m,event;
await step('fixtures, scores and concurrent edits',async()=>{await post({action:'competition',version:d.version,competition:{name:'ทดสอบระบบ · ไม่ใช่ผลจริง',date:'2026-09-27',seasonId:'season-1',players:d.state.profiles.map(p=>p.id),legs:2}});await get();assert.equal(d.state.matches.length,12);m=d.state.matches[0];event=await post({action:'score',version:d.version,id:m.id,hs:3,as:1});assert.equal(event.line,'off','LINE env must be unset for this test');await post({action:'score',version:d.version,id:m.id,hs:7,as:1},409);await get();assert.equal(standings(d.state,'season-1')[0].points,3)});
await step('undo, validation, structural lock, stale undo',async()=>{assert.equal((await post({action:'restore',version:d.version,id:m.id,eventId:event.eventId,undo:true})).line,'off');await get();assert.equal(d.state.matches[0].hs,null);assert.equal(d.state.history.length,2);
 await post({action:'score',version:d.version,id:m.id,hs:-1,as:0},400);await post({action:'competition',version:d.version,competition:{...d.state.competitions[0],legs:1}},400);
 const first=await post({action:'score',version:d.version,id:m.id,hs:2,as:2});await get();await post({action:'score',version:d.version,id:m.id,hs:5,as:2});await get();await post({action:'restore',version:d.version,id:m.id,eventId:first.eventId,undo:true},400)});
await step('badge upload and read',async()=>{const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');const {key}=await c.req('/api/badge',new Uint8Array(bytes),{headers:{'Content-Type':'image/png'}});const image=await send('/api/badge?key='+key);assert.equal(image.status,200);assert.equal(image.bytes.length,bytes.length);
 await post({action:'profile',version:d.version,profile:{...d.state.profiles[0],team:'QA Club',badge:key}});await get();assert.equal(d.state.profiles[0].team,'QA Club');assert.equal(d.state.history.length,4)});
await step('archive and sign out/in',async()=>{await post({action:'profile',version:d.version,profile:{...d.state.profiles[0],team:'',badge:''}});await get();await post({action:'archive',version:d.version,id:d.state.competitions[0].id,archived:true});await get();assert.equal(standings(d.state,'season-1').length,0);
 await c.auth({action:'logout'});await get();assert.equal(d.authenticated,false);await c.auth({action:'login',username:'qa-admin',password});await get();assert.equal(d.authenticated,true);await c.auth({action:'logout'})});
});
