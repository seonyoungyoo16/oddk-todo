"use client";

import { useState } from "react";
import { HiOutlinePlus, HiOutlineTrash, HiOutlineXMark } from "react-icons/hi2";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree";
import { goalTreeProjection } from "../../supabase/functions/_shared/goal-tree";
import { validGoalDraft, missingGoalDraftTasks } from "./goal-draft";
import type { GoalDraft } from "./goal-draft";
import { sameValue } from "./json-equality";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import "./goal-tree.css";

const validDraft = (value: unknown): value is GoalDraft | null => value === null || validGoalDraft(value);
type Props = { plan: Plan; onSave: (tree: GoalTree, expected: GoalTree) => boolean; onEdit: (task: Task) => void };

export function GoalTreeView({ plan, onSave, onEdit }: Props) {
  const local = useLocalDraft<GoalDraft | null>("goal-tree", null, validDraft);
  const tree = local.value?.value ?? plan.goalTree;
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const conflict = Boolean(local.value && !sameValue(local.value.base, plan.goalTree));
  const missing = local.value ? missingGoalDraftTasks(local.value, plan.tasks) : [];
  function change(value: GoalTree) {
    local.set(current => current ? { ...current, value } : { base: plan.goalTree, value, ...(plan.mandala ? { archive: plan.mandala } : {}) });
    setMessage("");
  }
  function groupChange(id: string, patch: Partial<GoalTree["groups"][number]>) {
    change({ ...tree, groups: tree.groups.map(group => group.id === id ? { ...group, ...patch } : group) });
  }
  function commit() {
    if (conflict || missing.length) { setMessage("바뀐 목표와 삭제된 할 일 연결을 먼저 확인해주세요. 초안은 유지했어요."); return; }
    if (onSave(tree, local.value?.base ?? plan.goalTree)) { local.set(null); setMessage("목표를 저장했어요."); }
    else setMessage("저장하지 못했어요. 초안은 유지했으니 다시 시도해주세요.");
  }
  const projection = goalTreeProjection(tree);
  return <section className="oddk-goalTree" aria-label="목표와 연결한 할 일">
    <DraftFeedback draft={local} />
    {conflict && <section className="oddk-draftConflict" role="alert"><strong>다른 화면에서 목표가 바뀌었어요.</strong><p>저장본: {plan.goalTree.goal || "이름 없음"} · {plan.goalTree.groups.length}개 / 내 초안: {tree.goal || "이름 없음"} · {tree.groups.length}개</p>
      <button type="button" onClick={() => { local.download(); local.set(null); }}>초안 백업 후 저장본 사용</button>
      <button type="button" onClick={() => { local.download(); local.set(current => current ? { ...current, base: plan.goalTree } : current); }}>백업 후 내 초안으로 계속 편집</button>
    </section>}
    <label className="oddk-goalRoot" htmlFor="goal-tree-root">핵심 목표<input id="goal-tree-root" maxLength={100} value={tree.goal} placeholder="이루고 싶은 목표" onChange={event => change({ ...tree, goal: event.target.value })} /></label>
    <div className="oddk-goalToolbar"><span>세부 목표 {tree.groups.length}/32</span><button type="button" disabled={tree.groups.length >= 32} onClick={() => change({ ...tree, groups: [...tree.groups, { id: crypto.randomUUID(), title: "", taskIds: [] }] })}><HiOutlinePlus aria-hidden="true" />세부 목표 추가</button></div>
    {!tree.groups.length && <p>세부 목표를 추가하고 기존 할 일을 연결해보세요.</p>}
    <div className="oddk-goalGroups">{tree.groups.map((group, index) => <article key={group.id} className="oddk-goalGroup" aria-label={`세부 목표 ${index + 1}`}>
      <header><label htmlFor={`goal-group-${group.id}`}>세부 목표 {index + 1}<input id={`goal-group-${group.id}`} maxLength={60} value={group.title} placeholder="세부 목표 이름" onChange={event => groupChange(group.id, { title: event.target.value })} /></label>
        <button type="button" aria-label={`세부 목표 ${index + 1} 삭제`} onClick={() => setDeleting(group.id)}><HiOutlineTrash aria-hidden="true" /></button></header>
      {deleting === group.id && <div role="alert"><p>목표와 연결 {group.taskIds.length}개를 지울까요? 할 일은 목록에 남아요.</p><button type="button" onClick={() => setDeleting(null)}>취소</button><button type="button" onClick={() => { change({ ...tree, groups: tree.groups.filter(item => item.id !== group.id) }); setDeleting(null); }}>목표만 삭제</button></div>}
      <ul>{group.taskIds.map(id => { const task = plan.tasks.find(item => item.id === id); return <li key={id}><button type="button" disabled={!task} className={task?.done ? "is-complete" : ""} onClick={() => task && onEdit(task)}>{task?.done ? "완료 · " : ""}{task?.title ?? `삭제된 할 일 (${id})`}{task?.summaryOnly ? " · 요약·집계 제외" : ""}</button><button type="button" aria-label={`${task?.title ?? id} 목표 연결 해제`} onClick={() => groupChange(group.id, { taskIds: group.taskIds.filter(value => value !== id) })}><HiOutlineXMark aria-hidden="true" /></button></li>; })}</ul>
      {group.missingTaskIds?.map(id => <p key={id}>이전 연결을 확인할 수 없어요: {id} <button type="button" onClick={() => groupChange(group.id, { missingTaskIds: group.missingTaskIds?.filter(value => value !== id) })}>이전 연결 해제</button></p>)}
      <label>할 일 연결<select value="" onChange={event => { if (event.target.value) groupChange(group.id, { taskIds: [...group.taskIds, event.target.value], missingTaskIds: group.missingTaskIds?.filter(id => id !== event.target.value) }); }}><option value="">목록에서 선택</option>{plan.tasks.filter(task => !group.taskIds.includes(task.id)).map(task => <option key={task.id} value={task.id}>{task.done ? "완료 · " : ""}{task.title}</option>)}</select></label>
    </article>)}</div>
    {missing.length > 0 && <p role="alert">삭제된 할 일 연결 {missing.length}개를 위에서 해제한 뒤 저장해주세요.</p>}
    <div className="oddk-goalToolbar"><button type="button" disabled={!local.value || conflict || missing.length > 0} onClick={commit}>목표 저장</button>{local.value && <button type="button" onClick={() => { local.download(); local.set(null); setMessage("목표 초안을 백업하고 저장본으로 돌아왔어요."); }}>초안 백업 후 취소</button>}</div>
    {message && <p role="status">{message}</p>}
    <details><summary>만다라트 8×8로 보기</summary>{projection ? <div className="oddk-goalProjection">{projection.areas.map((area, index) => <section key={index}><strong>{area.title || `세부 목표 ${index + 1}`}</strong><ol>{area.taskIds.map((id, slot) => <li key={slot}>{id ? plan.tasks.find(task => task.id === id)?.title ?? `이전 연결 (${id})` : "빈 칸"}</li>)}</ol></section>)}</div> : <p>세부 목표가 8개를 넘거나 연결한 할 일이 8개를 넘어요. 위 목표 트리에서 모두 확인할 수 있어요.</p>}</details>
    {plan.mandala && <details><summary>이전 만다라트 원본 보기</summary><p>원래 칸 위치와 중복 연결을 보존한 읽기 전용 기록이에요.</p><strong>{plan.mandala.goal}</strong><div className="oddk-goalProjection">{plan.mandala.areas.map((area, index) => <section key={index}><strong>{area.title || `세부 목표 ${index + 1}`}</strong><ol>{area.taskIds.map((id, slot) => <li key={slot}>{id ? plan.tasks.find(task => task.id === id)?.title ?? `이전 연결 (${id})` : "빈 칸"}</li>)}</ol></section>)}</div></details>}
  </section>;
}
