"use client";

import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree";
import { goalBoard, updateGoalBoard, validGoalDraft, missingGoalDraftTasks } from "./goal-draft";
import type { GoalDraft } from "./goal-draft";
import { sameValue } from "./json-equality";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { MandalaView } from "./planning-views";

const validDraft = (value: unknown): value is GoalDraft | null => value === null || validGoalDraft(value);
const changed = (draft: GoalDraft) => !sameValue(draft.base, draft.value) || Boolean(draft.board && !sameValue(draft.board, draft.baseBoard));
type Props = { plan: Plan; onSave: (tree: GoalTree, expected: GoalTree) => boolean; onEdit: (task: Task) => void };

export function GoalTreeView({ plan, onSave, onEdit }: Props) {
  const local = useLocalDraft<GoalDraft | null>("goal-tree", null, validDraft);
  // A clean layout cache must never hide newer synchronized goal content.
  const draft = local.value && (changed(local.value) || sameValue(local.value.base, plan.goalTree)) ? local.value : null;
  const tree = draft?.value ?? plan.goalTree;
  const board = goalBoard(tree, draft?.board ?? plan.mandala);
  const dirty = Boolean(draft && changed(draft));
  const conflict = Boolean(dirty && draft && !sameValue(draft.base, plan.goalTree));
  const missing = draft ? missingGoalDraftTasks(draft, plan.tasks) : [];

  return <section className="oddk-mandalaGoals" aria-label="만다라트 8×8 목표추적">
    <DraftFeedback draft={local} />
    {conflict && <section className="oddk-draftConflict" role="alert"><strong>다른 화면에서 목표가 바뀌었어요.</strong><p>저장본: {plan.goalTree.goal || "이름 없음"} / 내 초안: {tree.goal || "이름 없음"}</p>
      <button type="button" onClick={() => { local.download(); local.set(null); }}>초안 백업 후 저장본 사용</button>
      <button type="button" onClick={() => { local.download(); local.set(current => current ? { ...current, base: plan.goalTree } : current); }}>백업 후 내 초안으로 계속 편집</button>
    </section>}
    {missing.length > 0 && <p role="alert">삭제된 할 일 연결 {missing.length}개가 있어요. 해당 칸에서 연결을 해제하거나 다른 할 일을 선택해주세요.</p>}
    {board ? <MandalaView tasks={plan.tasks} draft={board} dirty={dirty && !conflict && missing.length === 0}
      onChange={value => local.set({ base: draft?.base ?? plan.goalTree, value: updateGoalBoard(tree, value), board: value, baseBoard: draft?.baseBoard ?? board, ...(plan.mandala ? { archive: plan.mandala } : {}) })}
      onSave={() => {
        if (conflict || missing.length || !onSave(tree, draft?.base ?? plan.goalTree)) return false;
        local.set({ base: tree, value: tree, board, baseBoard: board, ...(plan.mandala ? { archive: plan.mandala } : {}) });
        return true;
      }} onEdit={onEdit} /> : <p role="alert">기존 목표가 세부 목표 8개 또는 목표별 실행 8개를 넘어 만다라트에 모두 표시할 수 없어요. 기존 내용은 그대로 보관돼요.</p>}
  </section>;
}
