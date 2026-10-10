import { getAdminUser } from '@/app/admin-auth';
import { scheduleSchema } from '@/app/schedule-validation';
import { readSchedule, writeSchedule } from '@/db';
export const dynamic='force-dynamic';
export async function PUT(request:Request){
 try{
  if(!await getAdminUser())return Response.json({error:'需要管理员登录。'},{status:403});
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'请求来源无效。'},{status:403});
  if(!request.headers.get('content-type')?.includes('application/json'))return Response.json({error:'请求格式无效。'},{status:415});
  if(Number(request.headers.get('content-length')??0)>300000)return Response.json({error:'课表数据过大。'},{status:413});
  const text=await request.text();if(new TextEncoder().encode(text).length>300000)return Response.json({error:'课表数据过大。'},{status:413});
  let body;try{body=JSON.parse(text);}catch{return Response.json({error:'请求内容无效。'},{status:400});}
  const parsed=scheduleSchema.safeParse(body.schedule);
  if(!parsed.success)return Response.json({error:parsed.error.issues[0].message},{status:400});
  if(!Number.isSafeInteger(body.version)||body.version<1)return Response.json({error:'数据版本无效。'},{status:400});
  await readSchedule();const next=await writeSchedule(JSON.stringify(parsed.data),body.version);
  if(!next)return Response.json({error:'课表已在其他窗口更新，请刷新后重试。'},{status:409});
  return Response.json(next,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Write schedule failed',error);return Response.json({error:'保存失败，你的输入已保留，请稍后重试。'},{status:503});}
}
