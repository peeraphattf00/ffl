// Shared harness for API tests against the built Worker (run `npm run build` first).
// Applies every migration to a throwaway D1 under .wrangler/test-server/<pid> (never .wrangler/state), runs the seed SQL,
// starts `wrangler dev` on localhost and returns a cookie-keeping client. stop() ends only the server this process started.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {pbkdf2Sync,createHash} from 'node:crypto';
import {rmSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import http from 'node:http';
const root=resolve(import.meta.dirname,'..'),wrangler=join(root,'node_modules/wrangler/bin/wrangler.js'),env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
export const hash=(password,salt)=>pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
export const sessionId=token=>createHash('sha256').update(token).digest('hex');
export const sql=s=>s.replace(/'/g,"''");
export const userRow=(id,username,profileId,role,password,{mustChange=0,disabled=0}={})=>`INSERT INTO users (id,username,profile_id,role,hash,salt,must_change_password,disabled,created_at) VALUES ('${id}','${username}','${profileId}','${role}','${hash(password,'salt-'+id)}','salt-${id}',${mustChange},${disabled},${Date.now()});`;
export const OWNER={'oai-authenticated-user-id':'local_seedy'};// owner() trusts this header only on localhost
export async function startServer({seed='',port=Number(process.env.TEST_PORT||8791)}={}){
 if(!existsSync(join(root,'dist/server/wrangler.json')))throw new Error('Run `npm run build` first');
 const dir=join(root,'.wrangler','test-server',String(process.pid)),base=`http://localhost:${port}`;
 rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
 const config=join(dir,'migrate.json');writeFileSync(config,JSON.stringify({name:'test-server',compatibility_date:'2025-01-01',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:join(root,'drizzle')}]}));
 const run=args=>{const r=spawnSync(process.execPath,[wrangler,...args],{cwd:root,env,encoding:'utf8'});if(r.status!==0)throw new Error(r.stdout+r.stderr)};
 run(['d1','migrations','apply','site-creator-d1','--local','--persist-to',dir,'--config',config]);
 if(seed){writeFileSync(join(dir,'seed.sql'),seed);run(['d1','execute','site-creator-d1','--local','--persist-to',dir,'--config',config,'--file',join(dir,'seed.sql')])}
 const server=spawn(process.execPath,[wrangler,'dev','--config','dist/server/wrangler.json','--local','--persist-to',dir,'--ip','localhost','--port',String(port),'--inspector-port','0'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
 const stop=()=>{if(server.exitCode===null)spawnSync('taskkill',['/pid',String(server.pid),'/T','/F']);try{rmSync(dir,{recursive:true,force:true})}catch{}};
 process.on('exit',stop);
 // One connection per request: wrangler's local proxy can stall a reused keep-alive connection after a response that skipped the request body.
 const send=(path,{method='GET',headers={},body}={})=>new Promise((ok,fail)=>{const r=http.request(base+path,{method,headers:body===undefined?headers:{...headers,'Content-Length':Buffer.byteLength(body)},agent:false},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>{const buf=Buffer.concat(chunks);ok({status:res.statusCode,text:buf.toString('utf8'),bytes:buf,cookie:res.headers['set-cookie']?.[0]})})});r.on('error',fail);r.end(body)});
 class Client{cookie='';
  async req(path,body,{status=200,headers={}}={},retry=true){if(process.env.DEBUG)console.log('->',path,body?.action??'',JSON.stringify(headers));const r=await send(path,body===undefined?{headers:{cookie:this.cookie,...headers}}:{method:'POST',headers:{'Content-Type':'application/json',origin:base,cookie:this.cookie,...headers},body:body instanceof Uint8Array?Buffer.from(body):JSON.stringify(body)});const text=r.text;
   // wrangler dev occasionally restarts the local worker; the request never reached the app, so send it once more.
   if(r.status===503&&retry&&text.includes('restarted mid-request')){await new Promise(r=>setTimeout(r,1000));return this.req(path,body,{status,headers},false)}
   const j=text.startsWith('{')?JSON.parse(text):text;assert.equal(r.status,status,`${body?.action??path}: ${text}`);if(r.cookie)this.cookie=r.cookie.split(';')[0].endsWith('=')?'':r.cookie.split(';')[0];return j}
  league(){return this.req('/api/league')}
  auth(body,status){return this.req('/api/auth',body,{status})}
  users(status){return this.req('/api/users',undefined,{status})}
  manage(body,status){return this.req('/api/users',body,{status})}
  edit(body,status){return this.league().then(d=>this.req('/api/league',{version:d.version,...body},{status}))}}
 const t0=Date.now();while(true){try{if((await send('/api/league')).status===200)break}catch{}if(Date.now()-t0>90000){stop();throw new Error('wrangler dev did not start:\n'+log)}await new Promise(r=>setTimeout(r,500))}
 await new Promise(r=>setTimeout(r,3000));// let wrangler finish its initial reload before the first write
 return {base,send,Client,stop,log:()=>log};
}
// Runs named steps, prints PASS with their names, dumps the server log on failure or timeout, and always stops the server.
export async function steps(server,fn){const passed=[];const timer=setTimeout(()=>{console.error('--- wrangler log (timeout) ---\n'+server.log().slice(-2500));server.stop();process.exit(1)},Number(process.env.TEST_TIMEOUT||240000));timer.unref();
 try{await fn(async(name,body)=>{await body();passed.push(name)});console.log('PASS '+passed.join(', '))}catch(e){console.error('--- wrangler log ---\n'+server.log().slice(-2500));throw e}finally{clearTimeout(timer);server.stop()}}
