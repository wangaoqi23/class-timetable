import { z } from 'zod';
import { COLORS, type Schedule } from './schedule-model';
const short = (n:number)=>z.string().trim().max(n);
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'时间格式应为 HH:mm');
export const scheduleSchema=z.object({
 title:short(24).min(1,'请填写网站名称'),term:short(80).min(1,'请填写学期名称'),
 startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'请填写学期首个周一的日期'),weeks:z.number().int().min(1).max(30),demo:z.boolean(),
 periods:z.array(z.object({name:short(20).min(1),start:time,end:time})).min(1).max(16),
 classes:z.array(z.object({id:short(80).min(1),name:short(40).min(1),note:short(80)})).min(1,'至少保留一个班级').max(30),
 lessons:z.array(z.object({id:short(80).min(1),classId:short(80).min(1),name:short(60).min(1),teacher:short(60),room:short(80),day:z.number().int().min(0).max(6),start:z.number().int().min(0).max(15),end:z.number().int().min(0).max(15),from:z.number().int().min(1).max(30),to:z.number().int().min(1).max(30),parity:z.enum(['all','odd','even']),color:z.enum(COLORS as [string,...string[]])})).max(500),
}).superRefine((s,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message});
 const date=new Date(s.startDate+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==s.startDate||date.getUTCDay()!==1)issue('学期开始日期必须是有效的周一');
 if(new Set(s.classes.map(c=>c.id)).size!==s.classes.length||new Set(s.classes.map(c=>c.name)).size!==s.classes.length)issue('班级名称或编号重复');
 if(new Set(s.lessons.map(l=>l.id)).size!==s.lessons.length)issue('课程编号重复');
 s.periods.forEach((p,i)=>{if(p.start>=p.end||(i>0&&p.start<s.periods[i-1].end))issue('节次时间应按顺序排列，且结束时间晚于开始时间');});
 for(const l of s.lessons){if(!s.classes.some(c=>c.id===l.classId)||l.end<l.start||l.end>=s.periods.length||l.from>l.to||l.to>s.weeks)issue('课程「'+l.name+'」的班级、节次或教学周无效');if(l.from===l.to&&(l.parity==='odd'&&l.from%2===0||l.parity==='even'&&l.from%2===1))issue('课程「'+l.name+'」的教学周与单双周规则不匹配');}
 const occupied=new Map<string,string>();
 for(const l of s.lessons){for(let w=l.from;w<=l.to;w++){if(l.parity==='odd'&&w%2===0||l.parity==='even'&&w%2===1)continue;for(let p=l.start;p<=l.end;p++){const key=l.classId+':'+w+':'+l.day+':'+p;if(occupied.has(key)){issue('课程「'+l.name+'」与「'+occupied.get(key)+'」在第 '+w+' 周时间重叠');return;}occupied.set(key,l.name);}}}
});
export function validateSchedule(s:Schedule){const parsed=scheduleSchema.safeParse(s);return parsed.success?null:parsed.error.issues[0].message;}
