import ScheduleApp from '../schedule-app';
import { getAdminUser } from '../admin-auth';
import { getChatGPTUser,chatGPTSignInPath,chatGPTSignOutPath } from '../chatgpt-auth';
import { CalendarDays, ShieldCheck } from 'lucide-react';
export const dynamic='force-dynamic';
export default async function Admin(){
 const admin=await getAdminUser();if(admin)return <ScheduleApp admin adminName={admin.displayName}/>;
 const user=await getChatGPTUser();return <><header className="topbar"><a className="brand" href="/"><span className="brand-mark"><CalendarDays size={22}/></span>课间</a><a className="subtle" href="/">查看课表</a></header><main className="login-card"><ShieldCheck size={35} color="#2548e8"/><h1>课表管理后台</h1><p>{user?'当前账号没有课表编辑权限，请使用网站所有者的 ChatGPT 账号登录。':'使用管理员的 ChatGPT 账号登录，即可管理班级、课程与学期安排。'}</p><a className="btn primary" target="_top" href={user?chatGPTSignOutPath('/admin'):chatGPTSignInPath('/admin')}>{user?'退出并切换账号':'使用 ChatGPT 登录'}</a></main></>;
}
