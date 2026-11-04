import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import type { GoalBoard, Mandala, Plan } from "../../supabase/functions/_shared/plan.ts";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree.ts";
import { goalBoard, validGoalDraft } from "./goal-draft.ts";
import type { GoalDraft } from "./goal-draft.ts";
import { sameValue } from "./json-equality.ts";

export const firstGoalId = "default";
export type GoalWorkspace = { selectedId: string | null; drafts: Record<string, GoalDraft> };
export const emptyGoalWorkspace: GoalWorkspace = { selectedId: null, drafts: {} };
export function validGoalWorkspace(value: unknown): value is GoalWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return (data.selectedId === null || typeof data.selectedId === "string" && data.selectedId.length > 0 && data.selectedId.length <= 100) &&
    Boolean(data.drafts && typeof data.drafts === "object" && !Array.isArray(data.drafts) && Object.keys(data.drafts).length <= 32 &&
      Object.entries(data.drafts).every(([id, draft]) => id.length > 0 && id.length <= 100 && validGoalDraft(draft)));
}

export function planGoalBoards(plan: Plan): GoalBoard[] {
  if (plan.goalBoards) return plan.goalBoards.map((board, index) => index ? board : { ...board, goal: plan.goalTree.goal });
  if (!plan.goalTree.goal.trim() && plan.goalTree.groups.length === 0) return [];
  const used = new Set(plan.goalTree.groups.map(group => group.id));
  const groupIds = Array.from({ length: Math.max(8, plan.goalTree.groups.length) }, (_, index) => {
    if (plan.goalTree.groups[index]) return plan.goalTree.groups[index].id;
    let id = `${firstGoalId}-slot-${index}`;
    while (used.has(id)) id += "-new";
    used.add(id); return id;
  });
  return [{ id: firstGoalId, goal: plan.goalTree.goal, groupIds, ...(plan.mandala ? { layout: plan.mandala } : {}) }];
}

export const EMPTY_CORE_GOAL_MESSAGE = "빈 핵심목표를 먼저 입력하고 저장해주세요.";
/** Inspect every saved board; UI draft checks are an additional safeguard. */
export const hasEmptyCoreGoal = (plan: Plan) => planGoalBoards(plan).some(board => !board.goal.trim());

export type GoalDeletion = { id: string; board: GoalBoard; tree: GoalTree };
export function previewGoalDeletion(plan: Plan, id: string): GoalDeletion {
  const board = planGoalBoards(plan).find(board => board.id === id);
  if (!board) throw new Error("이 목표는 다른 화면에서 삭제됐어요. 목표 목록을 확인해주세요.");
  return { id, board, tree: goalBoardTree(plan, id) };
}

export function deleteGoalBoard(plan: Plan, expected: GoalDeletion): Plan {
  const current = previewGoalDeletion(plan, expected.id);
  if (!sameValue(current, expected)) throw new Error("다른 화면에서 이 목표가 바뀌었어요. 삭제 창을 다시 열어 확인해주세요.");
  const allBoards = planGoalBoards(plan), boards = allBoards.filter(board => board.id !== expected.id), removed = new Set(current.board.groupIds);
  const groups = plan.goalTree.groups.filter(group => !removed.has(group.id));
  const next: Plan = { ...plan, goalTree: { goal: boards[0]?.goal ?? "", groups },
    ...(plan.recurrences ? { recurrences: plan.recurrences.map(series => ({ ...series, goalGroupIds: series.goalGroupIds.filter(id => !removed.has(id)) })) } : {}) };
  if (boards.length) next.goalBoards = boards; else delete next.goalBoards;
  if (allBoards[0].id === expected.id && !groups.some(group => group.legacyArea !== undefined)) delete next.mandala;
  if (!validPlan(next)) throw new Error("목표를 삭제하지 못했어요. 기존 목표와 할 일은 유지돼요.");
  return next;
}

export function goalBoardTree(plan: Plan, id: string): GoalTree {
  const board = planGoalBoards(plan).find(board => board.id === id);
  if (!board) throw new Error("선택한 목표가 바뀌었어요. 목표를 다시 선택해주세요.");
  const groups = new Map(plan.goalTree.groups.map(group => [group.id, group]));
  return { goal: board.goal, groups: board.groupIds.map(id => groups.get(id) ?? { id, title: "", taskIds: [] }) };
}

export const goalDraftChanged = (draft: GoalDraft) => !sameValue(draft.base, draft.value) || Boolean(draft.board && !sameValue(draft.board, draft.baseBoard));

// Old drafts contained only the existing groups. Pad their unused positions
// with stable slot IDs while preserving every original group and link.
export function alignGoalDraft(draft: GoalDraft, board: GoalBoard): GoalDraft {
  if (draft.base.groups.length >= board.groupIds.length) return draft;
  const baseLength = draft.base.groups.length;
  const base = { ...draft.base, groups: board.groupIds.map((id, index) => draft.base.groups[index] ?? { id, title: "", taskIds: [] }) };
  const value = { ...draft.value, groups: board.groupIds.map((id, index) => {
    const group = draft.value.groups[index];
    return index < baseLength ? group ?? base.groups[index] : { ...(group ?? { title: "", taskIds: [] }), id };
  }) };
  return { ...draft, base, value, baseBoard: draft.baseBoard ?? goalBoard(base, draft.archive) ?? undefined };
}

export function goalDraftConflict(plan: Plan, id: string, draft: GoalDraft): boolean {
  const meta = planGoalBoards(plan).find(board => board.id === id);
  if (!meta) return true;
  const saved = goalBoardTree(plan, id);
  return !sameValue(saved, draft.base) || Boolean(draft.baseBoard && !sameValue(goalBoard(saved, meta.layout), draft.baseBoard));
}

export function addGoalBoard(plan: Plan, id: string): Plan {
  const boards = planGoalBoards(plan);
  if (boards.length >= 32) throw new Error("핵심목표는 최대 32개까지 추가할 수 있어요.");
  if (!id || id.length > 80 || boards.some(board => board.id === id)) throw new Error("새 목표를 추가하지 못했어요. 다시 시도해주세요.");
  if (hasEmptyCoreGoal(plan)) throw new Error(EMPTY_CORE_GOAL_MESSAGE);
  const reserved = new Set(boards.flatMap(board => board.groupIds));
  const groupIds = Array.from({ length: 8 }, (_, index) => `${id}-slot-${index}`);
  if (groupIds.some(id => reserved.has(id))) throw new Error("목표의 식별자가 겹쳐요. 다시 시도해주세요.");
  const next = { ...plan, goalBoards: [...boards, { id, goal: "", groupIds }] };
  if (!validPlan(next)) throw new Error("새 목표를 추가하지 못했어요. 기존 목표는 유지돼요.");
  return next;
}

export function saveGoalBoard(plan: Plan, id: string, draft: GoalDraft): Plan {
  const boards = planGoalBoards(plan), index = boards.findIndex(board => board.id === id), meta = boards[index];
  if (!meta || goalDraftConflict(plan, id, draft)) throw new Error("다른 화면에서 이 목표가 바뀌었어요. 초안을 확인해주세요.");
  if (!validGoalDraft(draft) || !draft.board || !sameValue(goalBoard(draft.value, draft.board), draft.board) || draft.value.groups.length !== meta.groupIds.length || draft.value.groups.some((group, i) => group.id !== meta.groupIds[i])) throw new Error("목표의 칸 구성이 바뀌었어요. 초안은 유지돼요.");
  const scope = new Set(meta.groupIds), existing = new Set(plan.goalTree.groups.map(group => group.id));
  const updates = new Map(draft.value.groups.map(group => [group.id, group]));
  const groups = plan.goalTree.groups.map(group => scope.has(group.id) ? updates.get(group.id)! : group);
  for (const group of draft.value.groups) if (!existing.has(group.id) && (group.title.trim() || group.taskIds.length || group.missingTaskIds?.length)) groups.push(group);
  const next: Plan = { ...plan, goalTree: { goal: index === 0 ? draft.value.goal : plan.goalTree.goal, groups },
    goalBoards: boards.map((board, i) => i === index ? { ...board, goal: draft.value.goal, layout: draft.board } : board) };
  if (!validPlan(next)) throw new Error("전체 세부목표 32개·할 일 연결 한도와 삭제된 할 일을 확인해주세요. 초안은 유지돼요.");
  return next;
}

export function editGoalBoardDraft(plan: Plan, id: string, board: Mandala, previous?: GoalDraft): GoalDraft {
  const saved = goalBoardTree(plan, id), meta = planGoalBoards(plan).find(item => item.id === id)!;
  return { base: previous?.base ?? saved, value: { goal: board.goal, groups: saved.groups.map((group, index) => {
    const area = board.areas[index], source = previous?.value.groups[index] ?? group;
    const missing = new Set(source.missingTaskIds ?? []), ids = [...new Set(area.taskIds.filter(Boolean))];
    return { ...source, title: area.title, taskIds: ids.filter(id => !missing.has(id)), ...(source.missingTaskIds ? { missingTaskIds: ids.filter(id => missing.has(id)) } : {}) };
  }) }, board, baseBoard: previous?.baseBoard ?? goalBoard(saved, meta.layout) ?? undefined, ...(plan.mandala ? { archive: plan.mandala } : {}) };
}
