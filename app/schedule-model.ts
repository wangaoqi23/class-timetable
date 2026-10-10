export type Period = { name: string; start: string; end: string };
export type SchoolClass = { id: string; name: string; note: string };
export type Lesson = { id: string; classId: string; name: string; teacher: string; room: string; day: number; start: number; end: number; from: number; to: number; parity: 'all'|'odd'|'even'; color: string };
export type Schedule = { title: string; term: string; startDate: string; weeks: number; periods: Period[]; classes: SchoolClass[]; lessons: Lesson[]; demo: boolean };
export type Snapshot = { schedule: Schedule; version: number; updatedAt: string };
export const DAYS = ['周一','周二','周三','周四','周五','周六','周日'];
export const COLORS = ['blue','violet','orange','teal','rose'];
const subjects = [['高等数学','陈老师','教学楼 A201','blue'],['大学英语','李老师','教学楼 B302','violet'],['程序设计','王老师','实验楼 402','teal'],['线性代数','刘老师','教学楼 A205','orange'],['大学物理','赵老师','教学楼 C101','rose'],['体育','周老师','田径场','teal']];
export const SAMPLE: Schedule = {
 title:'课间',term:'2026—2027 学年 · 第一学期',startDate:'2026-09-07',weeks:18,demo:true,
 periods:[{name:'第 1 节',start:'08:30',end:'09:15'},{name:'第 2 节',start:'09:15',end:'10:00'},{name:'第 3 节',start:'10:20',end:'11:05'},{name:'第 4 节',start:'11:05',end:'11:50'},{name:'第 5 节',start:'13:00',end:'13:45'},{name:'第 6 节',start:'13:45',end:'14:30'},{name:'第 7 节',start:'14:50',end:'15:35'},{name:'第 8 节',start:'15:35',end:'16:20'},{name:'第 9 节',start:'18:00',end:'18:45'},{name:'第 10 节',start:'18:45',end:'19:30'}],
 classes:[{id:'cs-01',name:'计算机 1 班',note:'2026 级'},{id:'cs-02',name:'计算机 2 班',note:'2026 级'},{id:'design-01',name:'设计 1 班',note:'2026 级'}],
 lessons:[0,1,2].flatMap(group=>[0,1,2,3,4,5,6,7,8].map(n=>{const s=subjects[(n+group)%6];const start=[0,2,4,0,2,4,0,2,4][n];return {id:`sample-${group}-${n}`,classId:['cs-01','cs-02','design-01'][group],name:s[0],teacher:s[1],room:s[2],color:s[3],day:[0,0,1,2,2,3,4,4,4][n],start,end:start+1,from:1,to:18,parity:'all' as const};})),
};
export function currentWeek(s:Schedule){const local=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});return Math.floor((Date.parse(local+'T00:00:00Z')-Date.parse(s.startDate+'T00:00:00Z'))/604800000)+1;}
export function visibleLessons(s:Schedule,classId:string,week:number){return s.lessons.filter(l=>l.classId===classId&&week>=l.from&&week<=l.to&&(l.parity==='all'||(l.parity==='odd'?week%2===1:week%2===0)));}
export function weekDates(s:Schedule,week:number){return DAYS.map((_,d)=>{const date=new Date(Date.parse(s.startDate+'T00:00:00Z')+((week-1)*7+d)*86400000);return `${date.getUTCMonth()+1}/${date.getUTCDate()}`;});}
