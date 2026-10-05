// Read-only backup of the public league data: GET /api/league plus every badge it references.
// Usage: node scripts/backup-league.mjs [siteUrl] [outDir]   (defaults: production Site, backups/<timestamp>)
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
const base=(process.argv[2]||'https://fc-friends-league.basic0407.chatgpt.site').replace(/\/$/,'');
const out=process.argv[3]||join('backups',new Date().toISOString().replace(/[:.]/g,'-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const res=await fetch(base+'/api/league',{headers:{'Cache-Control':'no-cache'}});if(!res.ok)throw new Error(`GET /api/league ${res.status}`);
const body=Buffer.from(await res.arrayBuffer());const {state,version}=JSON.parse(body.toString('utf8'));
await mkdir(out,{recursive:true});await writeFile(join(out,'league.json'),body);
const keys=[...new Set(state.profiles.map(p=>p.badge).filter(Boolean))];const badges=[];
for(const key of keys){const r=await fetch(base+'/api/badge?key='+encodeURIComponent(key));if(!r.ok)throw new Error(`badge ${key} ${r.status}`);const bytes=Buffer.from(await r.arrayBuffer());const file=join(out,key);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);badges.push({key,bytes:bytes.length,sha256:sha(bytes),contentType:r.headers.get('content-type')})}
const manifest={source:base,fetchedAt:new Date().toISOString(),version,leagueSha256:sha(body),counts:{profiles:state.profiles.length,seasons:state.seasons.length,competitions:state.competitions.length,matches:state.matches.length,played:state.matches.filter(m=>m.hs!==null).length,history:state.history.length},badges};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Backed up version ${version} (${body.length} bytes, ${badges.length} badges) to ${out}`);
