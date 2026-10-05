// Member-account API tests against the built Worker (run `npm run build` first).
// Starts `wrangler dev` on a throwaway D1 in .wrangler/test-members (never .wrangler/state), seeds it, runs the flows, then stops that server.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {pbkdf2Sync} from 'node:crypto';
import {rmSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import http from 'node:http';
import {initialState} from '../lib/league.ts';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'.wrangler','test-members',String(process.pid)),port=Number(process.env.TEST_PORT||8791),base=`http://localhost:${port}`;
const wrangler=join(root,'node_modules/wrangler/bin/wrangler.js'),env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
if(!existsSync(join(root,'dist/server/wrangler.json')))throw new Error('Run `npm run build` first');
const hash=(password,salt)=>pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
const user=(id,username,profileId,role,password,{mustChange=0,disabled=0}={})=>`INSERT INTO users (id,username,profile_id,role,hash,salt,must_change_password,disabled,created_at) VALUES ('${id}','${username}','${profileId}','${role}','${hash(password,'salt-'+id)}','salt-${id}',${mustChange},${disabled},${Date.now()});`;
// Seeded state: the shared password still exists (transition period) and a few accounts the API cannot create yet.
const LEGACY='legacy-password-1';
// League row as it exists before accounts: one played match whose history event has no 'by'.
const old=initialState();old.competitions.push({id:'comp-old',name:'before accounts',date:'2026-09-01',seasonId:'season-1',players:['player-1','player-2'],legs:1,archived:false});old.matches.push({id:'m-old',competitionId:'comp-old',home:'player-1',away:'player-2',round:1,hs:1,as:0,revision:1});old.history.push({id:'ev-old',matchId:'m-old',before:[null,null],after:[1,0],time:'2026-09-01T12:00:00.000Z',revision:1,kind:'บันทึกผล'});
const seed=[`INSERT INTO league (id,payload,version) VALUES ('main','${JSON.stringify(old).replace(/'/g,"''")}',5);`,`INSERT INTO settings (id,hash,salt) VALUES ('password','${hash(LEGACY,'legacy-salt')}','legacy-salt');`,
 user('u-tester','Tester','player-2','member','tester-password'),
 user('u-fresh','fresh','player-3','member','temp-pass-123',{mustChange:1}),
 user('u-off','offline','player-4','member','offline-password',{disabled:1}),
 user('u-many','many','player-9','member','many-password')].join('\n');
rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
const config=join(dir,'migrate.json');writeFileSync(config,JSON.stringify({name:'test-members',compatibility_date:'2025-01-01',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:join(root,'drizzle')}]}));
const run=args=>{const r=spawnSync(process.execPath,[wrangler,...args],{cwd:root,env,encoding:'utf8'});if(r.status!==0)throw new Error(r.stdout+r.stderr)};
run(['d1','migrations','apply','site-creator-d1','--local','--persist-to',dir,'--config',config]);
writeFileSync(join(dir,'seed.sql'),seed);run(['d1','execute','site-creator-d1','--local','--persist-to',dir,'--config',config,'--file',join(dir,'seed.sql')]);
const server=spawn(process.execPath,[wrangler,'dev','--config','dist/server/wrangler.json','--local','--persist-to',dir,'--ip','localhost','--port',String(port),'--inspector-port','0'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const stop=()=>{if(server.exitCode===null)spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'])};
process.on('exit',stop);
// One connection per request: wrangler's local proxy can stall a reused keep-alive connection after a response that skipped the request body.
function send(path,{method='GET',headers={},body}={}){return new Promise((ok,fail)=>{const r=http.request(base+path,{method,headers:body===undefined?headers:{...headers,'Content-Length':Buffer.byteLength(body)},agent:false},res=>{let text='';res.setEncoding('utf8');res.on('data',d=>text+=d);res.on('end',()=>ok({status:res.statusCode,text,cookie:res.headers['set-cookie']?.[0]}))});r.on('error',fail);r.end(body)})}
class Client{cookie='';
 async req(path,body,{status=200,headers={}}={},retry=true){if(process.env.DEBUG)console.log('->',path,body?.action??'',JSON.stringify(headers));const r=await send(path,body===undefined?{headers:{cookie:this.cookie,...headers}}:{method:'POST',headers:{'Content-Type':'application/json',origin:base,cookie:this.cookie,...headers},body:body instanceof Uint8Array?Buffer.from(body):JSON.stringify(body)});const text=r.text;
  // wrangler dev occasionally restarts the local worker; the request never reached the app, so send it once more.
  if(r.status===503&&retry&&text.includes('restarted mid-request')){await new Promise(r=>setTimeout(r,1000));return this.req(path,body,{status,headers},false)}const j=text.startsWith('{')?JSON.parse(text):text;assert.equal(r.status,status,`${body?.action??path}: ${text}`);if(r.cookie)this.cookie=r.cookie.split(';')[0].endsWith('=')?'':r.cookie.split(';')[0];return j}
 league(){return this.req('/api/league')}
 auth(body,status){return this.req('/api/auth',body,{status})}
 users(status){return this.req('/api/users',undefined,{status})}
 manage(body,status){return this.req('/api/users',body,{status})}
 edit(body,status){return this.league().then(d=>this.req('/api/league',{version:d.version,...body},{status}))}}
const t0=Date.now();while(true){try{if((await send('/api/league')).status===200)break}catch{}if(Date.now()-t0>90000){stop();throw new Error('wrangler dev did not start:\n'+log)}await new Promise(r=>setTimeout(r,500))}
await new Promise(r=>setTimeout(r,3000));// let wrangler finish its initial reload before the first write
const passed=[];setTimeout(()=>{console.error('--- wrangler log (timeout) ---\n'+log.slice(-2500));stop();process.exit(1)},Number(process.env.TEST_TIMEOUT||240000)).unref();const step=async(name,fn)=>{await fn();passed.push(name)};
try{
await step('anonymous read-only',async()=>{const a=new Client();const d=await a.league();assert.equal(d.me,null);assert.equal(d.authenticated,false);await a.edit({action:'season',name:'x'},401);await a.req('/api/badge',new Uint8Array(0),{status:401,headers:{'Content-Type':'image/png'}})});
const OWNER={'oai-authenticated-user-id':'local_seedy'};// owner() trusts this header only on localhost
const admin=new Client();
await step('first admin: owner only, once',async()=>{const a=new Client();assert.equal((await a.league()).hasAdmin,false);await a.req('/api/auth',{action:'bootstrap',username:'kevin',password:'admin-password',profileId:'player-1'},{status:403});await admin.req('/api/auth',{action:'bootstrap',username:'kevin',password:'admin-password',profileId:'nope'},{status:400,headers:OWNER});await admin.req('/api/auth',{action:'bootstrap',username:'kevin',password:'admin-password',profileId:'player-1'},{headers:OWNER});const d=await admin.league();assert.equal(d.hasAdmin,true);assert.equal(d.me.role,'admin');assert.equal(d.me.profileId,'player-1');assert.equal(d.me.mustChangePassword,false);await new Client().req('/api/auth',{action:'bootstrap',username:'second',password:'admin-password',profileId:'player-5'},{status:403,headers:OWNER})});
const TEMP=/^[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}$/;let newProfile='',newbieTemp='';
await step('only admins manage accounts',async()=>{await new Client().users(401);const m=new Client();await m.auth({action:'login',username:'tester',password:'tester-password'});await m.users(403);await m.manage({action:'create',username:'sneaky',profileId:'player-1'},403);const l=new Client();await l.req('/api/league',{action:'login',password:LEGACY});await l.users(403)});
await step('admin creates a member with a one-time temporary password',async()=>{await admin.edit({action:'profile',profile:{name:'Newbie',team:'',badge:'',active:true}});const d=await admin.league();newProfile=d.state.profiles.find(p=>p.name==='Newbie').id;await admin.edit({action:'profile',profile:{name:'Benched',team:'',badge:'',active:false}});const benched=(await admin.league()).state.profiles.find(p=>p.name==='Benched').id;
 await admin.manage({action:'create',username:'dup',profileId:'player-2'},409);await admin.manage({action:'create',username:'ghost',profileId:'nope'},400);await admin.manage({action:'create',username:'benched',profileId:benched},400);await admin.manage({action:'create',username:'x',profileId:newProfile},400);await admin.manage({action:'create',username:'TESTER',profileId:newProfile},409);
 const r=await admin.manage({action:'create',username:'newbie',profileId:newProfile});assert.match(r.password,TEMP);newbieTemp=r.password;const u=r.users.find(x=>x.username==='newbie');assert.equal(u.mustChangePassword,true);assert.equal(u.role,'member');assert.equal(u.profileId,newProfile);assert.ok(!('hash' in u)&&!('salt' in u));
 const list=await admin.users();assert.ok(list.users.every(x=>!('hash' in x)));const n=new Client();await n.auth({action:'login',username:'newbie',password:r.password});assert.equal((await n.league()).me.mustChangePassword,true);await n.edit({action:'season',name:'x'},403)});
await step('temporary password must be replaced, other sessions end',async()=>{const n=new Client(),other=new Client();await n.auth({action:'login',username:'newbie',password:newbieTemp});await other.auth({action:'login',username:'newbie',password:newbieTemp});
 await n.auth({action:'password',current:'wrong-one',next:'brand-new-pass'},400);await n.auth({action:'password',current:newbieTemp,next:'short'},400);await n.auth({action:'password',current:newbieTemp,next:newbieTemp},400);
 await n.auth({action:'password',current:newbieTemp,next:'brand-new-pass'});const d=await n.league();assert.equal(d.me.mustChangePassword,false);assert.equal(d.authenticated,true);await n.edit({action:'season',name:'newbie season'});
 assert.equal((await other.league()).me,null,'other session must be revoked');await new Client().auth({action:'login',username:'newbie',password:newbieTemp},401);
 await n.auth({action:'password',current:'brand-new-pass',next:'second-new-pass'});await new Client().auth({action:'login',username:'newbie',password:'second-new-pass'});
 const l=new Client();await l.req('/api/league',{action:'login',password:LEGACY});await l.auth({action:'password',current:LEGACY,next:'whatever-123'},401)});
await step('history records who edited, old events still restore',async()=>{const m=new Client();await m.auth({action:'login',username:'tester',password:'tester-password'});
 await m.edit({action:'restore',id:'m-old',eventId:'ev-old'});let d=await m.league();const restored=d.state.history[0];assert.equal(restored.by,'player-2');assert.equal(restored.kind,'คืนค่า');assert.equal(d.state.history.find(h=>h.id==='ev-old').by,undefined,'old event must stay untouched');assert.equal(d.state.matches.find(x=>x.id==='m-old').hs,null);
 const ev=await m.edit({action:'score',id:'m-old',hs:2,as:2});d=await m.league();assert.equal(d.state.history[0].by,'player-2');
 const l=new Client();await l.req('/api/league',{action:'login',password:LEGACY});await l.edit({action:'score',id:'m-old',hs:3,as:2});d=await l.league();assert.equal(d.state.history[0].by,'legacy');
 await admin.edit({action:'restore',id:'m-old',eventId:ev.eventId});d=await admin.league();assert.equal(d.state.history[0].by,'player-1');assert.deepEqual(d.state.history[0].after,[null,null])});
await step('generic login errors',async()=>{const a=new Client();const x=await a.auth({action:'login',username:'nobody',password:'whatever-1'},401);const y=await a.auth({action:'login',username:'tester',password:'wrong-password'},401);assert.equal(x.error,y.error)});
let testerKeep;
await step('login is case-insensitive and returns me',async()=>{const a=new Client();testerKeep=a;await a.auth({action:'login',username:'TESTER',password:'tester-password'});const d=await a.league();assert.deepEqual(d.me,{legacy:false,id:'u-tester',username:'Tester',role:'member',profileId:'player-2',mustChangePassword:false});assert.equal(d.authenticated,true);await a.edit({action:'season',name:'member season'})});
await step('temporary password blocks every write',async()=>{const a=new Client();await a.auth({action:'login',username:'fresh',password:'temp-pass-123'});const d=await a.league();assert.equal(d.me.mustChangePassword,true);assert.equal(d.authenticated,false);await a.edit({action:'season',name:'x'},403);await a.req('/api/badge',new Uint8Array(0),{status:403,headers:{'Content-Type':'image/png'}})});
await step('disabled account cannot log in',async()=>{const a=new Client();await a.auth({action:'login',username:'offline',password:'offline-password'},403);await a.auth({action:'login',username:'offline',password:'nope-nope'},401)});
await step('shared password still edits during transition',async()=>{const a=new Client();await a.req('/api/league',{action:'login',password:LEGACY});const d=await a.league();assert.deepEqual(d.me,{legacy:true});await a.edit({action:'season',name:'legacy season'})});
await step('logout ends the session',async()=>{const a=new Client();await a.auth({action:'login',username:'tester',password:'tester-password'});const old=a.cookie;await a.auth({action:'logout'});assert.equal(a.cookie,'');a.cookie=old;assert.equal((await a.league()).me,null)});
await step('successful logins are not rate limited',async()=>{for(let i=0;i<8;i++)await new Client().auth({action:'login',username:'many',password:'many-password'})});
await step('per-username limit leaves other accounts alone',async()=>{const a=new Client();for(let i=0;i<5;i++)await a.auth({action:'login',username:'tester',password:'bad-'+i},401);await a.auth({action:'login',username:'tester',password:'tester-password'},429);await a.auth({action:'login',username:'many',password:'many-password'})});
let testerTemp='';
await step('admin reset: new temporary password, sessions ended, lockout cleared',async()=>{await new Client().auth({action:'login',username:'tester',password:'tester-password'},429);assert.ok((await testerKeep.league()).me,'tester still signed in before reset');
 const m=new Client();await m.auth({action:'login',username:'newbie',password:'second-new-pass'});await m.manage({action:'reset',id:'u-tester'},403);await admin.manage({action:'reset',id:'missing'},404);
 const r=await admin.manage({action:'reset',id:'u-tester'});assert.match(r.password,TEMP);testerTemp=r.password;assert.equal(r.users.find(u=>u.id==='u-tester').mustChangePassword,true);
 assert.equal((await testerKeep.league()).me,null,'existing sessions must end');await new Client().auth({action:'login',username:'tester',password:'tester-password'},401);
 const t=new Client();await t.auth({action:'login',username:'tester',password:testerTemp});assert.equal((await t.league()).me.mustChangePassword,true);await t.edit({action:'season',name:'x'},403);await t.auth({action:'password',current:testerTemp,next:'tester-password-2'});await t.edit({action:'season',name:'after reset'})});
await step('disable ends sessions and blocks login; enable keeps the password; last admin protected',async()=>{
 await admin.manage({action:'disable',id:(await admin.league()).me.id,disabled:true},400);
 const n=new Client();await n.auth({action:'login',username:'newbie',password:'second-new-pass'});await n.manage({action:'disable',id:'u-tester',disabled:true},403);
 const r=await admin.manage({action:'disable',id:(await n.league()).me.id,disabled:true});assert.equal(r.users.find(u=>u.username==='newbie').disabled,true);
 assert.equal((await n.league()).me,null,'disabled account must lose its session');await new Client().auth({action:'login',username:'newbie',password:'second-new-pass'},403);
 await admin.manage({action:'disable',id:r.users.find(u=>u.username==='newbie').id,disabled:false});await new Client().auth({action:'login',username:'newbie',password:'second-new-pass'});
 assert.ok((await admin.league()).state.profiles.some(p=>p.id===newProfile),'profile and history stay')});
await step('per-address limit across usernames',async()=>{const a=new Client();let blocked=false;for(let i=0;i<25&&!blocked;i++){const r=await send('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({action:'login',username:'spray'+i,password:'bad-password'})});blocked=r.status===429}assert.ok(blocked,'IP limit never triggered');await a.auth({action:'login',username:'many',password:'many-password'},429)});
console.log('PASS '+passed.join(', '));
}catch(e){console.error('--- wrangler log ---\n'+log.slice(-2500));throw e}finally{stop();try{rmSync(dir,{recursive:true,force:true})}catch{}}
