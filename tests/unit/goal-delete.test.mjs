import test from "node:test";
import assert from "node:assert/strict";
import { addGoalBoard, deleteGoalBoard, editGoalBoardDraft, goalBoardTree, planGoalBoards, previewGoalDeletion, saveGoalBoard } from "../../app/todo/goal-boards.ts";
import { goalBoard } from "../../app/todo/goal-draft.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { parsePlanRequest } from "../../supabase/functions/plan-sync/request.ts";
import { createRecurrence } from "../../supabase/functions/_shared/repeat-actions.ts";

const fixture = () => ({ schemaVersion:5, tasks:[{id:"a",title:"Keep task",notes:"Keep notes",plannedDate:"2026-10-31",startTime:null,minutes:null,bufferMinutes:null,endTime:null,endDate:null,endDayOffset:null,priority:"normal",done:false}], start:"09:00", reviewsByDate:{"2026-10-31":"Keep review"}, goalTree:{goal:"First",groups:[{id:"g",title:"First group",taskIds:["a"]}]} });
function fill(plan,id,title) {
  const meta=planGoalBoards(plan).find(b=>b.id===id), board=structuredClone(goalBoard(goalBoardTree(plan,id),meta.layout));
  board.goal=title;board.areas[0].title="Second group";board.areas[0].taskIds[2]="a";board.areas[0].taskIds[7]="a";
  return saveGoalBoard(plan,id,editGoalBoardDraft(plan,id,board));
}

test("goal deletion removes only its board and links, preserving tasks, other layouts and archive",()=>{
  let p=fixture();p.mandala=goalBoard(p.goalTree);p=fill(addGoalBoard(p,"second"),"second","Second");const raw=JSON.stringify(p),other=planGoalBoards(p)[0];
  const next=deleteGoalBoard(p,previewGoalDeletion(p,"second"));
  assert.equal(validPlan(next),true);assert.equal(next.tasks,p.tasks);assert.deepEqual(next.reviewsByDate,p.reviewsByDate);assert.deepEqual(next.mandala,p.mandala);
  assert.deepEqual(planGoalBoards(next),[other]);assert.deepEqual(goalBoardTree(next,"default"),goalBoardTree(p,"default"));assert.equal(next.goalTree.groups.some(g=>g.id.startsWith("second-")),false);assert.equal(JSON.stringify(p),raw);
});
test("deleting first goal promotes the next goal without changing its ID or duplicate cell positions",()=>{
  const p=fill(addGoalBoard(fixture(),"second"),"second","Second"),saved=planGoalBoards(p)[1];
  const next=deleteGoalBoard(p,previewGoalDeletion(p,"default"));
  assert.equal(validPlan(next),true);assert.equal(next.goalTree.goal,"Second");assert.deepEqual(planGoalBoards(next),[saved]);
  assert.deepEqual(goalBoardTree(next,"second"),goalBoardTree(p,"second"));assert.equal(next.tasks,p.tasks);
  assert.equal(fill(next,"second","Updated second").goalTree.goal,"Updated second");
});
test("deleting last goal persists an empty state accepted by the existing sync contract and can add again",()=>{
  const p=fixture(),next=deleteGoalBoard(p,previewGoalDeletion(p,"default"));
  assert.deepEqual(next.goalTree,{goal:"",groups:[]});assert.equal(next.goalBoards,undefined);assert.deepEqual(planGoalBoards(next),[]);assert.equal(validPlan(next),true);
  assert.equal(parsePlanRequest(JSON.stringify({action:"push",version:1,plan:next})).ok,true);
  const reloaded=loadPlan(JSON.stringify(next));assert.equal(reloaded.ok,true);assert.deepEqual(planGoalBoards(reloaded.plan),[]);
  const again=fill(addGoalBoard(reloaded.plan,"new"),"new","New goal");assert.equal(again.goalTree.goal,"New goal");assert.equal(again.tasks.length,1);
});
test("concurrent changes to the selected goal and repeated deletion are rejected atomically",()=>{
  const p=fill(addGoalBoard(fixture(),"second"),"second","Second"),snapshot=previewGoalDeletion(p,"second"),changed=fill(p,"second","Changed");
  const raw=JSON.stringify(changed);assert.throws(()=>deleteGoalBoard(changed,snapshot),/바뀌/);assert.equal(JSON.stringify(changed),raw);
  const removed=deleteGoalBoard(p,snapshot);assert.throws(()=>deleteGoalBoard(removed,snapshot),/삭제/);
});
test("unrelated goal updates do not block deletion and remain intact",()=>{
  const p=fill(addGoalBoard(fixture(),"second"),"second","Second"),snapshot=previewGoalDeletion(p,"default"),updated=fill(p,"second","Latest other");
  const next=deleteGoalBoard(updated,snapshot);assert.equal(next.goalTree.goal,"Latest other");assert.deepEqual(goalBoardTree(next,"second"),goalBoardTree(updated,"second"));
});
test("deletion removes recurrence links to the deleted goal while preserving the series and shared task",()=>{
  let p=fill(addGoalBoard(fixture(),"second"),"second","Second");p=createRecurrence(p,"a","series",{frequency:"daily",startDate:"2026-10-31",untilDate:"2026-10-31",interval:1},{from:"2026-10-31",through:"2026-10-31"});
  const next=deleteGoalBoard(p,previewGoalDeletion(p,"default"));assert.equal(validPlan(next),true);assert.equal(next.tasks,p.tasks);assert.equal(next.recurrences[0].id,p.recurrences[0].id);
  assert.equal(next.recurrences[0].goalGroupIds.includes("g"),false);assert.ok(next.recurrences[0].goalGroupIds.includes("second-slot-0"));
});
