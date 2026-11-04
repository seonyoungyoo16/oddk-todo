"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlinePlus, HiOutlineTrash } from "react-icons/hi2";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import { goalBoard, validGoalDraft, missingGoalDraftTasks } from "./goal-draft";
import type { GoalDraft } from "./goal-draft";
import { alignGoalDraft, editGoalBoardDraft, emptyGoalWorkspace, goalBoardTree, goalDraftChanged, goalDraftConflict, planGoalBoards, validGoalWorkspace, previewGoalDeletion, hasEmptyCoreGoal, EMPTY_CORE_GOAL_MESSAGE, type GoalDeletion } from "./goal-boards";
import { sameValue } from "./json-equality";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { GoalManagementMenu, MandalaView } from "./planning-views";
import { GoalDeleteDialog } from "./goal-delete-dialog";

const validDraft = (value: unknown): value is GoalDraft | null => value === null || validGoalDraft(value);
type Props = { plan: Plan; ready: boolean; onSave: (id: string, draft: GoalDraft) => string | null; onAdd: (id: string) => string | null; onDelete: (target: GoalDeletion) => string | null; onEdit: (task: Task) => void };

export function GoalTreeView({ plan, ready, onSave, onAdd, onDelete, onEdit }: Props) {
  const local = useLocalDraft("goal-boards", emptyGoalWorkspace, validGoalWorkspace);
  // Keep the original single-goal draft readable. Its bytes remain a backup
  // after the first board is adopted into the per-goal draft collection.
  const legacy = useLocalDraft<GoalDraft | null>("goal-tree", null, validDraft);
  const boards = useMemo(() => planGoalBoards(plan), [plan]);
  const selected = boards.find(board => board.id === local.value.selectedId) ?? boards[0];
  const drafts = useMemo(() => {
    const values: Record<string, GoalDraft> = Object.create(null);
    for (const [index, meta] of boards.entries()) {
      const raw = Object.hasOwn(local.value.drafts, meta.id) ? local.value.drafts[meta.id] : index === 0 ? legacy.value : null;
      if (!raw) continue;
      const draft = alignGoalDraft(raw, meta);
      // A clean cache must not conceal a newer goal from another device.
      if (goalDraftChanged(draft) || !goalDraftConflict(plan, meta.id, draft)) values[meta.id] = draft;
    }
    return values;
  }, [boards, legacy.value, local.value.drafts, plan]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState<{ snapshot: GoalDeletion; title: string; dirty: boolean } | null>(null);
  const saveDrafts = local.set;
  const pending = useMemo(() => Object.entries(drafts).filter(([id, draft]) => goalDraftChanged(draft) && draft.board && !goalDraftConflict(plan, id, draft) && missingGoalDraftTasks(draft, plan.tasks).length === 0), [drafts, plan]);

  useEffect(() => {
    if (!ready || !local.hydrated || !legacy.hydrated || local.problem || legacy.problem || !pending.length) return;
    const timer = window.setTimeout(() => {
      for (const [id, draft] of pending) {
        if (id === deleting?.snapshot.id) continue;
        const error = onSave(id, draft);
        setErrors(current => current[id] === (error ?? "") ? current : { ...current, [id]: error ?? "" });
        if (!error) saveDrafts(current => {
          const latest = current.drafts[id];
          if (latest && !sameValue(alignGoalDraft(latest, boards.find(board => board.id === id)!), draft)) return current;
          return { ...current, drafts: { ...current.drafts, [id]: { ...draft, base: draft.value, baseBoard: draft.board } } };
        });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [boards, deleting, legacy.hydrated, legacy.problem, local.hydrated, local.problem, onSave, pending, ready, retry, saveDrafts]);

  const draft = selected ? drafts[selected.id] : undefined;
  const saved = selected ? goalBoardTree(plan, selected.id) : { goal: "", groups: [] }, tree = draft?.value ?? saved;
  const board = selected ? goalBoard(tree, draft?.board ?? selected.layout) : null;
  const dirty = Boolean(draft && goalDraftChanged(draft));
  const conflict = Boolean(selected && dirty && draft && goalDraftConflict(plan, selected.id, draft));
  const missing = draft ? missingGoalDraftTasks(draft, plan.tasks) : [];
  const error = errors[selected?.id ?? "add"];
  const adding = useRef(false);
  useEffect(() => { adding.current = false; }, [boards]);
  const blankStoredGoal = hasEmptyCoreGoal(plan);
  const blankDraftGoal = Object.values(drafts).some(draft => !draft.value.goal.trim());
  const unsettledDraft = Object.values(drafts).some(goalDraftChanged);
  const addBlocked = !ready || !local.hydrated || !legacy.hydrated || Boolean(local.problem || legacy.problem) || blankStoredGoal || blankDraftGoal || unsettledDraft || Boolean(deleting);
  const addHint = blankStoredGoal || blankDraftGoal ? EMPTY_CORE_GOAL_MESSAGE : unsettledDraft ? "목표를 저장한 뒤 새 목표를 추가할 수 있어요." : "";
  const updateDraft = (next: GoalDraft) => { if (selected) local.set(current => ({ ...current, drafts: { ...current.drafts, [selected.id]: next } })); };
  function backupSelectedDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ goalId: selected?.id, draft, saved, savedBoard: goalBoard(saved, selected?.layout) })], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "oddk-goal-draft-backup.json"; link.click(); URL.revokeObjectURL(url);
  }
  const toolbar = <>
    <div className="oddk-goalSwitcher">
      {selected && <label><span className="oddk-srOnly">목표 전환</span><select aria-label="목표 전환" value={selected.id} disabled={!ready || !local.hydrated} onChange={event => { const id = event.target.value; local.set(current => ({ ...current, selectedId: id })); }}>
        {boards.map((meta, index) => <option key={meta.id} value={meta.id}>{drafts[meta.id]?.value.goal.trim() || meta.goal.trim() || `새 목표 ${index + 1}`}</option>)}
      </select></label>}
      <button type="button" className="oddk-goalAdd" aria-label="새 목표 추가" title={addHint || "새 목표 추가"} aria-describedby={addHint ? "goal-add-hint" : undefined} disabled={addBlocked} onClick={() => {
        if (addBlocked || adding.current) return;
        adding.current = true;
        const id = crypto.randomUUID(), error = onAdd(id);
        if (error) { adding.current = false; setErrors(current => ({ ...current, [selected?.id ?? "add"]: error })); return; }
        local.set(current => ({ ...current, selectedId: id }));
      }}><HiOutlinePlus aria-hidden="true" /><span>새 목표</span></button>
      {addHint && <small id="goal-add-hint" className="oddk-goalAddHint">{addHint}</small>}
    </div>
  </>;
  const management = selected && <button type="button" className="oddk-goalDelete" aria-label="현재 목표 삭제" disabled={!ready || !local.hydrated || !legacy.hydrated || Boolean(local.problem) || Boolean(legacy.problem)} onClick={() => {
    try { setDeleting({ snapshot: previewGoalDeletion(plan, selected.id), title: tree.goal.trim() || "이름 없는 목표", dirty }); }
    catch (error) { setErrors(current => ({ ...current, [selected.id]: (error as Error).message })); }
  }}><HiOutlineTrash aria-hidden="true" />목표 삭제</button>;

  return <section className="oddk-mandalaGoals" aria-label="만다라트 목표추적">
    <DraftFeedback draft={local} /><DraftFeedback draft={legacy} />
    {conflict && draft && <section className="oddk-draftConflict" role="alert"><strong>다른 화면에서 이 목표가 바뀌었어요.</strong><p>저장본: {saved.goal || "이름 없음"} / 내 초안: {tree.goal || "이름 없음"}</p>
      <button type="button" onClick={() => { backupSelectedDraft(); updateDraft({ base: saved, value: saved, board: goalBoard(saved, selected?.layout) ?? undefined, baseBoard: goalBoard(saved, selected?.layout) ?? undefined, ...(plan.mandala ? { archive: plan.mandala } : {}) }); }}>초안 백업 후 저장본 사용</button>
      <button type="button" onClick={() => { backupSelectedDraft(); updateDraft({ ...draft, base: saved, baseBoard: goalBoard(saved, selected?.layout) ?? undefined }); }}>백업 후 내 초안 적용</button>
    </section>}
    {missing.length > 0 && <p role="alert">삭제된 할 일 연결 {missing.length}개가 있어요. 해당 칸에서 연결을 해제하거나 다른 할 일을 선택해주세요.</p>}
    {error && <p role="alert" className="oddk-mandalaFeedback">{error} <button type="button" onClick={() => { setErrors(current => ({ ...current, [selected?.id ?? "add"]: "" })); setRetry(value => value + 1); }}>다시 시도</button></p>}
    {selected && board ? <MandalaView key={selected.id} tasks={plan.tasks} draft={board} toolbar={toolbar} management={management}
      onChange={value => { updateDraft(editGoalBoardDraft(plan, selected.id, value, draft)); setErrors(current => current[selected.id] ? { ...current, [selected?.id ?? "add"]: "" } : current); }} onEdit={onEdit} /> : <><div className="oddk-mandalaToolbar">{toolbar}{selected && <GoalManagementMenu>{management}</GoalManagementMenu>}</div>{selected ? <p role="alert">기존 목표가 세부목표 8개 또는 목표별 실행 8개를 넘어 모두 표시할 수 없어요. 기존 내용은 그대로 보관돼요.</p> : <div className="oddk-goalEmpty"><h2>아직 목표가 없어요</h2><p>새 목표를 추가해 시작해보세요.</p>{legacy.value && goalDraftChanged(legacy.value) && <button type="button" className="oddk-goalAdd" disabled={!ready || Boolean(legacy.problem)} onClick={() => { const error = onAdd("default"); if (error) setErrors(current => ({ ...current, add: error })); else local.set(current => ({ ...current, selectedId: "default" })); }}>이전 목표 초안 복구</button>}</div>}</>}
    {deleting && <GoalDeleteDialog title={deleting.title} dirty={deleting.dirty} onCancel={() => setDeleting(null)} onConfirm={() => {
      const error = onDelete(deleting.snapshot);
      if (error) return error;
      const id = deleting.snapshot.id, remaining = boards.filter(board => board.id !== id);
      local.set(current => { const drafts = { ...current.drafts }; delete drafts[id]; return { ...current, selectedId: remaining[0]?.id ?? null, drafts }; });
      if (boards[0]?.id === id) legacy.set(null);
      setErrors(current => { const next = { ...current }; delete next[id]; return next; });
      setDeleting(null); return null;
    }} />}
  </section>;
}
