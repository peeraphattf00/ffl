// Migrates a throwaway local D1 holding a copy of league data and checks nothing existing changed.
// Usage: node scripts/test-migration.mjs [backups/<ts>/league.json]   (default: synthetic old-format data)
// Never touches .wrangler/state; everything lives in .wrangler/migration-test and is removed first.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {initialState,fixtures,standings} from '../lib/league.ts';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'.wrangler','migration-test'),config=join(dir,'wrangler.json');
const journal=JSON.parse(readFileSync(join(root,'drizzle/meta/_journal.json'),'utf8')).entries.map(e=>join(root,'drizzle',e.tag+'.sql'));
function synthetic(){const s=initialState();const ids=s.profiles.map(p=>p.id);s.profiles[0].badge='badges/00000000-0000-4000-8000-000000000001.png';s.competitions.push({id:'comp-1',name:'synthetic',date:'2026-09-27',seasonId:'season-1',players:ids,legs:2,archived:false});s.matches.push(...fixtures(ids,2,'comp-1'));s.matches.slice(0,5).forEach((m,i)=>{m.hs=i;m.as=(i*2)%3;m.revision=1;s.history.unshift({id:'ev-'+i,matchId:m.id,before:[null,null],after:[m.hs,m.as],time:new Date(Date.UTC(2026,8,27,12,i)).toISOString(),revision:1,kind:'บันทึกผล'})});return {state:s,version:7}}
const source=process.argv[2],{state,version}=source?JSON.parse(readFileSync(source,'utf8')):synthetic();const payload=JSON.stringify(state);
rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
writeFileSync(config,JSON.stringify({name:'ffl-migration-test',compatibility_date:'2025-01-01',d1_databases:[{binding:'DB',database_name:'migration-test',database_id:'00000000-0000-4000-8000-000000000000'}]}));
function d1(...args){const r=spawnSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','migration-test','--local','--persist-to',dir,'--config',config,...args],{cwd:root,encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'}});if(r.status!==0)throw new Error(r.stdout+r.stderr);return r.stdout}
const file=(name,sql)=>{const p=join(dir,name);writeFileSync(p,sql);d1('--file',p)};
const query=sql=>JSON.parse(d1('--json','--command',sql)).map(x=>x.results);
const snapshot=()=>query('SELECT id,payload,version FROM league; SELECT * FROM settings; SELECT id,expires FROM sessions ORDER BY id; SELECT * FROM attempts');
const q=s=>s.replace(/'/g,"''");
// Database as the current production code leaves it: first migration, league row, shared password, a live session and a rate-limit row.
d1('--file',journal[0]);
file('seed.sql',`INSERT INTO league (id,payload,version) VALUES ('main','${q(payload)}',${version});INSERT INTO settings (id,hash,salt) VALUES ('password','legacy-hash','legacy-salt');INSERT INTO sessions (id,expires) VALUES ('legacy-session',${Date.now()+43200000});INSERT INTO attempts (id,count,reset) VALUES ('ip-hash',3,${Date.now()+900000});INSERT INTO attempts (id,count,reset) VALUES ('legacy:ip-hash',2,${Date.now()+900000});`);
const before=snapshot();
for(const m of journal.slice(1))d1('--file',m);
const after=snapshot();
// Only the migration that retires the shared password may remove rows, and only the shared-password ones; everything else must be byte-identical.
const retired=journal.some(m=>m.endsWith('_retire_shared_password.sql'));
const expected=retired?[before[0],before[1].filter(r=>r.id!=='password'),before[2].filter(r=>r.id!=='legacy-session'),before[3].filter(r=>!r.id.startsWith('legacy:'))]:before;
assert.deepEqual(after,expected,'existing rows changed during migration');
const migrated=JSON.parse(after[0][0].payload);assert.equal(after[0][0].payload,payload,'league payload bytes changed');assert.equal(after[0][0].version,version,'league version changed');
const latest=s=>s.matches.filter(m=>m.hs!==null).map(m=>[m.id,m.hs,m.as,m.revision]);
for(const season of state.seasons)assert.deepEqual(standings(migrated,season.id),standings(state,season.id),`standings changed in ${season.name}`);
assert.deepEqual(latest(migrated),latest(state),'results changed');assert.deepEqual(migrated.history,state.history,'history changed');assert.deepEqual(migrated.profiles.map(p=>[p.id,p.badge]),state.profiles.map(p=>[p.id,p.badge]),'badges changed');
if(!retired){const [[legacy]]=query("SELECT user_id FROM sessions WHERE id='legacy-session'");assert.equal(legacy.user_id,null,'legacy session must keep a null user_id')}
const [[{n}]]=query('SELECT count(*) AS n FROM users');assert.equal(n,0,'migration must not create accounts');
query(`INSERT INTO sessions (id,expires) VALUES ('old-code-insert',${Date.now()})`);// rollback: the pre-migration code inserts sessions without user_id
rmSync(dir,{recursive:true,force:true});
console.log(`PASS ${journal.length} migrations on ${source||'synthetic data'} · version ${version} · ${state.seasons.length} seasons · ${state.matches.length} matches · ${state.history.length} history · league row byte-identical, standings/results/history/badges unchanged, ${retired?'only shared-password rows removed':'other rows byte-identical, legacy session kept'}, old-code session insert works`);
