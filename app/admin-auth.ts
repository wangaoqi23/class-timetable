import { env } from 'cloudflare:workers';
import { getChatGPTUser } from './chatgpt-auth';
export async function getAdminUser(){
 const user=await getChatGPTUser();
 const admin=(env.ADMIN_EMAIL??'').trim().toLowerCase();
 return user&&admin&&user.email.toLowerCase()===admin?user:null;
}
