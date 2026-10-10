import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { SAMPLE, type Snapshot } from '../app/schedule-model';

function binding(){ if(!env.DB)throw new Error('Database unavailable');return env.DB; }
type StateRow={value:string;version:number;updated_at:string};
function snapshot(row:StateRow):Snapshot{return {schedule:JSON.parse(row.value),version:row.version,updatedAt:row.updated_at};}
export async function readSchedule():Promise<Snapshot>{
 const db=binding();let row=await db.prepare('SELECT value, version, updated_at FROM timetable_state WHERE id = 1').first<StateRow>();
 if(!row){await db.prepare('INSERT INTO timetable_state (id,value,version,updated_at) VALUES (1,?,1,?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(SAMPLE),new Date().toISOString()).run();row=await db.prepare('SELECT value, version, updated_at FROM timetable_state WHERE id = 1').first<StateRow>();}
 if(!row)throw new Error('Schedule unavailable');return snapshot(row);
}
export async function writeSchedule(value:string,version:number):Promise<Snapshot|null>{
 const row=await binding().prepare('UPDATE timetable_state SET value = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ? RETURNING value, version, updated_at').bind(value,new Date().toISOString(),version).first<StateRow>();
 return row?snapshot(row):null;
}

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
