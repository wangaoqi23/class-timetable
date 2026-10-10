import { readSchedule } from '@/db';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await readSchedule(),{headers:{'Cache-Control':'no-store'}});}catch(error){console.error('Read schedule failed',error);return Response.json({error:'课表暂时无法加载，请稍后重试。'},{status:503,headers:{'Cache-Control':'no-store'}});}}
