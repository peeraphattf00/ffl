// Who may do what in POST /api/league. Pure (no DB), so the API and the UI share one set of rules.
// Admins may do everything. Members may edit only their own profile's name, team and badge, and may record, clear, undo and restore any result.
import type {Me} from './auth';
export const ACTIONS=['profile','season','competition','archive','score','restore'] as const;
export type Action=typeof ACTIONS[number];
// profile: id of the profile being saved (none = new profile); active = the value being saved; current = the stored profile, if any.
export type Target={id?:string;active?:boolean;current?:{active:boolean}};
export type Verdict={ok:true}|{ok:false;reason:string};
const yes:Verdict={ok:true},no=(reason:string):Verdict=>({ok:false,reason});
export const isAction=(x:unknown):x is Action=>ACTIONS.includes(x as Action);
export function can(me:Pick<Me,'role'|'profileId'>|null|undefined,action:Action,target:Target={}):Verdict{
 if(!me)return no('กรุณาเข้าสู่ระบบก่อนแก้ไขข้อมูล');
 if(action==='score'||action==='restore'||me.role==='admin')return yes;
 if(action==='profile'){
  if(!target.id)return no('เฉพาะผู้ดูแลระบบเพิ่มผู้เล่นใหม่ได้');
  if(target.id!==me.profileId)return no('แก้ไขได้เฉพาะโปรไฟล์ของตัวเอง');
  if(target.active!==undefined&&target.current&&target.active!==target.current.active)return no('เฉพาะผู้ดูแลระบบเปิดหรือปิดโปรไฟล์ได้');
  return yes}
 return no(action==='season'?'เฉพาะผู้ดูแลระบบสร้างหรือแก้ฤดูกาลได้':action==='competition'?'เฉพาะผู้ดูแลระบบสร้างหรือแก้โปรแกรมได้':'เฉพาะผู้ดูแลระบบเก็บเข้าคลังหรือกู้คืนโปรแกรมได้');
}
