import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {loadPlan} from "../supabase/functions/_shared/plan-migration.ts";
import {previewReplan,replanClock} from "../supabase/functions/_shared/replan.ts";
import {sameValue} from "../supabase/functions/_shared/json-equality.ts";
const root="https://synxmskamifpovuziecx.supabase.co",key="sb_publishable_ACwZjSLbL_dU9hilmAV7CQ_FEH8AT29";
const users=JSON.parse(readFileSync(new URL("../.sync-auth-fixture.json",import.meta.url),"utf8"));
assert.equal(users.length,2);assert.ok(users.every(u=>u.email.endsWith("@example.invalid")&&u.marker.startsWith("oddk-verification-")));
const clients=users.map(()=>createClient(root,key,{auth:{persistSession:false,autoRefreshToken:false}})),sessions=[];
let checks=0;
async function api(endpoint,body,expected=200,account=0,extra={}){const response=await fetch(`${root}/functions/v1/${endpoint}`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${sessions[account].access_token}`,...extra},body:JSON.stringify(body)});const value=await response.json();if(expected!==null)assert.equal(response.status,expected,JSON.stringify(value));return expected===null?{status:response.status,value}:value;}
const actual=()=>api("execution",{action:"status"});
const pull=()=>api("plan-sync",{action:"pull"});
const phase=(type,recordId,revision)=>api("execution",{action:"command",operationId:randomUUID(),revision,command:{type,recordId}});
async function start(revision){return api("execution",{action:"command",operationId:randomUUID(),revision,command:{type:"start",taskId:"one"}});}
async function preview(){const [row,state]=await Promise.all([pull(),actual()]);assert.equal(state.current,null);const clock=replanClock(state.now);const options={date:clock.date,baseMinute:Math.min(1438,clock.minute+2),pinnedIds:[]};const result=previewReplan(row.plan,options);return {row,state,result,body:{action:"replan",plan:result.after,version:row.version,executionRevision:state.revision,options}};}
let source;
async function reset(){const row=await pull();await api("plan-sync",{action:"push",plan:source,version:row.version});}
try{
 for(let i=0;i<2;i++){const {data,error}=await clients[i].auth.signInWithPassword({email:users[i].email,password:users[i].password});assert.equal(error,null);sessions.push(data.session);}
 // execution may already have a plan in the full suite; bootstrap both owners first.
 const today=replanClock(new Date().toISOString()).date;
 const loaded=loadPlan(JSON.stringify({schemaVersion:2,reviewsByDate:{},start:"09:00",tasks:["one","two"].map(id=>({id,title:`Synthetic replan ${id}`,done:false,priority:"normal",minutes:2,bufferMinutes:1,startTime:null,plannedDate:today}))}));assert.equal(loaded.ok,true);
 source={...loaded.plan,schemaVersion:6,recurrences:[],availabilityByDate:{[today]:{start:"00:00",end:"24:00",fixed:[]}}};
 for(let i=0;i<2;i++){const current=await api("plan-sync",{action:"ensure",plan:source},200,i);await api("plan-sync",{action:"push",plan:source,version:current.version},200,i);}
 const other=await api("plan-sync",{action:"pull"},200,1);let p=await preview();
 if(!p.result.changes.length||p.result.firstStart===null)throw Error("No feasible current-day fixture window; run before 23:56 KST");
 await api("plan-sync",p.body,401,0,{authorization:"Bearer invalid"});await api("plan-sync",p.body,403,0,{origin:"https://evil.invalid"});await api("plan-sync",{...p.body,user_id:users[1].id},400);checks++;
 const forged=structuredClone(p.body);forged.plan.tasks[0].title="Forged";await api("plan-sync",forged,409);await api("plan-sync",{...p.body,executionRevision:p.body.executionRevision+1},409);checks++;
 const saved=await api("plan-sync",p.body);assert.equal(saved.version,p.row.version+1);assert.ok(sameValue(saved.plan,p.result.after));assert.equal((await actual()).revision,p.state.revision);checks++;
 await api("plan-sync",p.body,409);assert.equal((await pull()).version,saved.version);checks++;
 assert.ok(sameValue((await api("plan-sync",{action:"pull"},200,1)),other));checks++;
 await reset();p=await preview();let running=await start(p.state.revision);const activeBefore=JSON.stringify(running.current);
 await api("plan-sync",{...p.body,executionRevision:running.revision},409);assert.equal(JSON.stringify((await actual()).current),activeBefore);checks++;
 running=await phase("pause",running.current.id,running.revision);await api("plan-sync",{...p.body,executionRevision:running.revision},409);assert.equal((await actual()).current.id,running.current.id);checks++;
 await phase("stop",running.current.id,running.revision);await api("plan-sync",p.body,409);assert.ok(sameValue((await pull()).plan,p.row.plan));checks++;
 p=await preview();const row=await pull();const changed={...row.plan,tasks:row.plan.tasks.map(t=>t.id==="one"?{...t,notes:"Other device edit"}:t)};await api("plan-sync",{action:"push",plan:changed,version:row.version});await api("plan-sync",p.body,409);assert.ok(sameValue((await pull()).plan,changed));checks++;
 await reset();p=await preview();const timings=[];const commands=[{endpoint:"plan-sync",body:p.body},{endpoint:"execution",body:{action:"command",operationId:randomUUID(),revision:p.state.revision,command:{type:"start",taskId:"one"}}}];
 const race=await Promise.all(commands.map(async(c,i)=>{const sent=performance.now(),result=await api(c.endpoint,c.body,null);timings[i]={sent,received:performance.now()};return result;}));
 assert.ok(timings[0].sent<timings[1].received&&timings[1].sent<timings[0].received);assert.ok(race.every(r=>[200,409].includes(r.status)));assert.ok(race.some(r=>r.status===200));
 const after=await pull(),state=await actual();if(race[0].status===409)assert.ok(sameValue(after.plan,p.row.plan));else assert.ok(sameValue(after.plan,p.result.after));
 if(race.every(r=>r.status===200))assert.ok(Date.parse(state.current.startedAt)+1>=Date.parse(after.updated_at),"Both successes must serialize replan before timer context");
 if(state.current)await phase("stop",state.current.id,state.revision);checks++;
 await reset();p=await preview();const wrongDate={...p.body.options,date:"2026-01-01"};await api("plan-sync",{...p.body,plan:previewReplan(p.row.plan,wrongDate).after,options:wrongDate},409);await api("plan-sync",{...p.body,options:{...p.body.options,pinnedIds:["gone"]}},400);checks++;
 const denied=await clients[0].rpc("replan_checked_commit",{p_user:users[1].id,p_plan_version:1,p_execution_version:0,p_date:today,p_first_start:null,p_plan:source});assert.equal(denied.error?.code,"42501");checks++;
 console.log(`PASS ${checks} real replan API groups; in-flight replan/start outcomes ${race.map(r=>r.status).join("/")}, serializable plan/actual guards, no source duration changes.`);
}finally{for(const client of clients)await client.auth.signOut();}
