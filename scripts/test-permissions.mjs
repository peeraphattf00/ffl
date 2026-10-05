import assert from 'node:assert/strict';
import {can,isAction,ACTIONS} from '../lib/permissions.ts';
const admin={role:'admin',profileId:'player-1'},member={role:'member',profileId:'player-2'};
const own={id:'player-2',active:true,current:{active:true}},other={id:'player-3',active:true,current:{active:true}},create={active:true},toggle={id:'player-2',active:false,current:{active:true}};
// [action, target, admin allowed, member allowed] — one row per cell of the permission table.
const table=[['profile',own,true,true],['profile',other,true,false],['profile',create,true,false],['profile',toggle,true,false],['profile',{id:'player-3',active:false,current:{active:true}},true,false],
 ['season',{},true,false],['competition',{},true,false],['archive',{},true,false],['score',{},true,true],['restore',{},true,true]];
for(const [action,target,a,m] of table){for(const [me,allowed] of [[admin,a],[member,m]]){const v=can(me,action,target);assert.equal(v.ok,allowed,`${me.role} ${action} ${JSON.stringify(target)}`);if(!v.ok)assert.match(v.reason,/[ก-๙]/,'reason must be Thai')}}
// Member: badge and team edits ride on the same own-profile check; editing a profile without touching active is allowed.
assert.equal(can(member,'profile',{id:'player-2'}).ok,true);assert.equal(can(member,'profile',{id:'player-3'}).ok,false);
// Signed out: nothing.
for(const action of ACTIONS){assert.equal(can(null,action,own).ok,false);assert.equal(can(undefined,action).ok,false)}
assert.equal(new Set(table.map(r=>r[0])).size,ACTIONS.length,'every action is covered');
assert.ok(isAction('score'));assert.ok(!isAction('login'));assert.ok(!isAction(undefined));
console.log('PASS permission table: admin and member × profile (own, other, new, active), season, competition, archive, score, restore; signed out denied');
