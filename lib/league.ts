export type Profile={id:string;name:string;team:string;badge:string;active:boolean};
export type Season={id:string;name:string};
export type Competition={id:string;name:string;date:string;seasonId:string;players:string[];legs:1|2;archived:boolean};
export type Match={id:string;competitionId:string;home:string;away:string;round:number;hs:number|null;as:number|null;revision:number};
export type History={id:string;matchId:string;before:[number|null,number|null];after:[number|null,number|null];time:string;revision:number;kind:string;by?:string};
export type LeagueState={profiles:Profile[];seasons:Season[];currentSeason:string;competitions:Competition[];matches:Match[];history:History[]};
export function initialState():LeagueState{return {profiles:['KEVIN','Dioxzyp','YEPPO','EKAI'].map((name,i)=>({id:`player-${i+1}`,name,team:'',badge:'',active:true})),seasons:[{id:'season-1',name:'Season 01'}],currentSeason:'season-1',competitions:[],matches:[],history:[]}}
export function fixtures(players:string[],legs:1|2,competitionId:string):Match[]{
 const ring:(string|null)[]=[...players];if(ring.length%2)ring.push(null);const first:Match[]=[];
 for(let r=0;r<ring.length-1;r++){for(let i=0;i<ring.length/2;i++){let a=ring[i],b=ring[ring.length-1-i];if(a&&b){if((r+i)%2)[a,b]=[b,a];first.push({id:crypto.randomUUID(),competitionId,home:a,away:b,round:r+1,hs:null,as:null,revision:0})}}ring.splice(1,0,ring.pop()!)}
 return legs===1?first:[...first,...first.map(m=>({...m,id:crypto.randomUUID(),home:m.away,away:m.home,round:m.round+ring.length-1}))];
}
export function standings(s:LeagueState,seasonId:string){
 const comps=s.competitions.filter(c=>c.seasonId===seasonId&&!c.archived);const ids=new Set(comps.flatMap(c=>c.players));const matches=s.matches.filter(m=>comps.some(c=>c.id===m.competitionId)&&m.hs!==null&&m.as!==null);
 const rows=s.profiles.filter(p=>ids.has(p.id)).map(p=>({profile:p,played:0,won:0,drawn:0,lost:0,gf:0,ga:0,gd:0,points:0}));
 for(const m of matches)for(const r of rows){if(r.profile.id!==m.home&&r.profile.id!==m.away)continue;const h=r.profile.id===m.home;const a=h?m.hs!:m.as!,b=h?m.as!:m.hs!;r.played++;r.gf+=a;r.ga+=b;r.gd=r.gf-r.ga;if(a>b){r.won++;r.points+=3}else if(a===b){r.drawn++;r.points++}else r.lost++}
 const h2h=(id:string,group:string[])=>matches.reduce((n,m)=>{if(!group.includes(m.home)||!group.includes(m.away))return n;if(m.home===id)return n+(m.hs!>m.as!?3:m.hs===m.as?1:0);if(m.away===id)return n+(m.as!>m.hs!?3:m.hs===m.as?1:0);return n},0);
 return rows.sort((a,b)=>{const d=b.points-a.points||b.gd-a.gd||b.gf-a.gf;if(d)return d;const group=rows.filter(r=>r.points===a.points&&r.gd===a.gd&&r.gf===a.gf).map(r=>r.profile.id);return h2h(b.profile.id,group)-h2h(a.profile.id,group)||a.profile.name.localeCompare(b.profile.name)});
}
