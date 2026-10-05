// Member-account API tests against the built Worker (run `npm run build` first).
// Starts `wrangler dev` on a throwaway D1 in .wrangler/test-members (never .wrangler/state), seeds it, runs the flows, then stops that server.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {pbkdf2Sync} from 'node:crypto';
import {rmSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import http from 'node:http';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'.wrangler','test-members',String(process.pid)),port=Number(process.env.TEST_PORT||8791),base=`http://localhost:${port}`;
const wrangler=join(root,'node_modules/wrangler/bin/wrangler.js'),env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
if(!existsSync(join(root,'dist/server/wrangler.json')))throw new Error('Run `npm run build` first');
const hash=(password,salt)=>pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
const user=(id,username,profileId,role,password,{mustChange=0,disabled=0}={})=>`INSERT INTO users (id,username,profile_id,role,hash,salt,must_change_password,disabled,created_at) VALUES ('${id}','${username}','${profileId}','${role}','${hash(password,'salt-'+id)}','salt-${id}',${mustChange},${disabled},${Date.now()});`;
// Seeded state: the shared password still exists (transition period) and a few accounts the API cannot create yet.
const LEGACY='legacy-password-1';
const seed=[`INSERT INTO settings (id,hash,salt) VALUES ('password','${hash(LEGACY,'legacy-salt')}','legacy-salt');`,
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
 edit(body,status){return this.league().then(d=>this.req('/api/league',{version:d.version,...body},{status}))}}
const t0=Date.now();while(true){try{if((await send('/api/league')).status===200)break}catch{}if(Date.now()-t0>90000){stop();throw new Error('wrangler dev did not start:\n'+log)}await new Promise(r=>setTimeout(r,500))}
await new Promise(r=>setTimeout(r,3000));// let wrangler finish its initial reload before the first write
const passed=[];setTimeout(()=>{console.error('--- wrangler log (timeout) ---\n'+log.slice(-2500));stop();process.exit(1)},Number(process.env.TEST_TIMEOUT||240000)).unref();const step=async(name,fn)=>{await fn();passed.push(name)};
try{
await step('anonymous read-only',async()=>{const a=new Client();const d=await a.league();assert.equal(d.me,null);assert.equal(d.authenticated,false);await a.edit({action:'season',name:'x'},401);await a.req('/api/badge',new Uint8Array(0),{status:401,headers:{'Content-Type':'image/png'}})});
const OWNER={'oai-authenticated-user-id':'local_seedy'};// owner() trusts this header only on localhost
const admin=new Client();
await step('first admin: owner only, once',async()=>{const a=new Client();assert.equal((await a.league()).hasAdmin,false);await a.req('/api/auth',{action:'bootstrap',username:'kevin',password:'admin-password',profileId:'player-1'},{status:403});await admin.req('/api/auth',{action:'bootstrap',username:'kevin',password:'admin-password',profileId:'nope'},{status:400,headers:OWNER});await admin.req('/api/auth',{action:'bootstrap',username:'kevin',password:'admin-password',profileId:'player-1'},{headers:OWNER});const d=await admin.league();assert.equal(d.hasAdmin,true);assert.equal(d.me.role,'admin');assert.equal(d.me.profileId,'player-1');assert.equal(d.me.mustChangePassword,false);await new Client().req('/api/auth',{action:'bootstrap',username:'second',password:'admin-password',profileId:'player-5'},{status:403,headers:OWNER})});
await step('generic login errors',async()=>{const a=new Client();const x=await a.auth({action:'login',username:'nobody',password:'whatever-1'},401);const y=await a.auth({action:'login',username:'tester',password:'wrong-password'},401);assert.equal(x.error,y.error)});
await step('login is case-insensitive and returns me',async()=>{const a=new Client();await a.auth({action:'login',username:'TESTER',password:'tester-password'});const d=await a.league();assert.deepEqual(d.me,{legacy:false,id:'u-tester',username:'Tester',role:'member',profileId:'player-2',mustChangePassword:false});assert.equal(d.authenticated,true);await a.edit({action:'season',name:'member season'})});
await step('temporary password blocks every write',async()=>{const a=new Client();await a.auth({action:'login',username:'fresh',password:'temp-pass-123'});const d=await a.league();assert.equal(d.me.mustChangePassword,true);assert.equal(d.authenticated,false);await a.edit({action:'season',name:'x'},403);await a.req('/api/badge',new Uint8Array(0),{status:403,headers:{'Content-Type':'image/png'}})});
await step('disabled account cannot log in',async()=>{const a=new Client();await a.auth({action:'login',username:'offline',password:'offline-password'},403);await a.auth({action:'login',username:'offline',password:'nope-nope'},401)});
await step('shared password still edits during transition',async()=>{const a=new Client();await a.req('/api/league',{action:'login',password:LEGACY});const d=await a.league();assert.deepEqual(d.me,{legacy:true});await a.edit({action:'season',name:'legacy season'})});
await step('logout ends the session',async()=>{const a=new Client();await a.auth({action:'login',username:'tester',password:'tester-password'});const old=a.cookie;await a.auth({action:'logout'});assert.equal(a.cookie,'');a.cookie=old;assert.equal((await a.league()).me,null)});
await step('successful logins are not rate limited',async()=>{for(let i=0;i<8;i++)await new Client().auth({action:'login',username:'many',password:'many-password'})});
await step('per-username limit leaves other accounts alone',async()=>{const a=new Client();for(let i=0;i<5;i++)await a.auth({action:'login',username:'tester',password:'bad-'+i},401);await a.auth({action:'login',username:'tester',password:'tester-password'},429);await a.auth({action:'login',username:'many',password:'many-password'})});
await step('per-address limit across usernames',async()=>{const a=new Client();let blocked=false;for(let i=0;i<25&&!blocked;i++){const r=await send('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify({action:'login',username:'spray'+i,password:'bad-password'})});blocked=r.status===429}assert.ok(blocked,'IP limit never triggered');await a.auth({action:'login',username:'many',password:'many-password'},429)});
console.log('PASS '+passed.join(', '));
}catch(e){console.error('--- wrangler log ---\n'+log.slice(-2500));throw e}finally{stop();try{rmSync(dir,{recursive:true,force:true})}catch{}}
