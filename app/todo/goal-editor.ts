import type { Plan, Mandala } from "../../supabase/functions/_shared/plan.ts";
import type { GoalTree } from "../../supabase/functions/_shared/goal-tree.ts";
import { goalTreeFromMandala } from "../../supabase/functions/_shared/goal-tree.ts";
import type { EditorDraft } from "./workspace-draft.ts";
import { sameValue } from "./json-equality.ts";
import { saveGoalTree } from "./goal-actions.ts";

export function taskGoalIds(tree: GoalTree, id: string): string[] {
  return tree.groups.filter(group => group.taskIds.includes(id)).map(group => group.id).sort();
}
export function legacyEditorLinksChanged(editor: EditorDraft): boolean {
  const original = editor.baseMandala.areas.flatMap((area, a) => area.taskIds.flatMap((id, c) => id === editor.base.id ? [`${a}:${c}`] : []));
  return !sameValue([...original].sort(), [...editor.links].sort());
}
export function editorGoalIds(editor: EditorDraft, plan: Plan): string[] {
  if (editor.goalLinks !== undefined) return editor.goalLinks;
  return taskGoalIds(plan.goalTree, editor.base.id);
}
export function editorGoalConflict(editor: EditorDraft, plan: Plan): boolean {
  return editor.baseGoalTree !== undefined && !sameValue(taskGoalIds(editor.baseGoalTree, editor.base.id), taskGoalIds(plan.goalTree, editor.base.id));
}
export function convertLegacyEditorLinks(editor: EditorDraft, plan: Plan): string[] {
  const areas = new Set(editor.links.map(link => Number(link.split(":")[0])));
  const groups = plan.goalTree.groups.filter(group => group.legacyArea !== undefined && areas.has(group.legacyArea));
  if (groups.length !== areas.size) throw new Error("삭제된 이전 세부 목표가 있어요. 새 목표에서 연결할 항목을 직접 선택해주세요. 이전 초안은 유지했어요.");
  return groups.map(group => group.id);
}
// Apply only the user's legacy changes; leave later variable groups untouched.
export function mergeLegacyGoalDraft(plan: Plan, base: Mandala, draft: Mandala): Plan {
  const before = goalTreeFromMandala(base, plan.tasks), proposed = goalTreeFromMandala(draft, plan.tasks);
  const tree = structuredClone(plan.goalTree);
  if (base.goal !== draft.goal) {
    if (tree.goal !== base.goal && tree.goal !== draft.goal) throw new Error("핵심 목표가 바뀌었어요. 이전 초안과 현재 목표를 비교해주세요.");
    tree.goal = draft.goal;
  }
  for (let index = 0; index < 8; index++) {
    if (sameValue(base.areas[index], draft.areas[index])) continue;
    const old = before.groups[index], next = proposed.groups[index];
    const current = tree.groups.find(group => group.legacyArea === index);
    if (!current) throw new Error("이전 세부 목표가 삭제됐어요. 초안을 백업한 뒤 새 목표에서 연결해주세요.");
    if (old.title !== next.title) {
      if (current.title !== old.title && current.title !== next.title) throw new Error("세부 목표 이름이 바뀌었어요. 현재 목표와 이전 초안을 비교해주세요.");
      current.title = next.title;
    }
    const removed = new Set(old.taskIds.filter(id => !next.taskIds.includes(id)));
    current.taskIds = [...new Set([...current.taskIds.filter(id => !removed.has(id)), ...next.taskIds.filter(id => !old.taskIds.includes(id))])];
    const missingRemoved = new Set((old.missingTaskIds ?? []).filter(id => !next.missingTaskIds?.includes(id)));
    current.missingTaskIds = [...new Set([...(current.missingTaskIds ?? []).filter(id => !missingRemoved.has(id)), ...(next.missingTaskIds ?? []).filter(id => !old.missingTaskIds?.includes(id))])];
  }
  return saveGoalTree({ ...plan, mandala: draft }, tree);
}
