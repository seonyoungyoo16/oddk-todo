export type TaskHierarchy = { parentTaskId?: string | null; summaryOnly?: boolean };
export function validHierarchyShape(value: Record<string, unknown>, schema: number | undefined): boolean {
  if (schema !== 5 && (value.parentTaskId !== undefined || value.summaryOnly !== undefined)) return false;
  return (value.parentTaskId === undefined || value.parentTaskId === null || typeof value.parentTaskId === "string" && value.parentTaskId.length > 0) && (value.summaryOnly === undefined || typeof value.summaryOnly === "boolean");
}
export function validTaskParents(tasks: Array<TaskHierarchy & { id: string }>): boolean {
  const parents = new Map(tasks.map(task => [task.id, task.parentTaskId ?? null])), resolved = new Set<string>();
  for (const task of tasks) {
    const path = new Set<string>(); let id: string | null = task.id;
    while (id !== null && !resolved.has(id)) {
      if (!parents.has(id) || path.has(id)) return false;
      path.add(id); id = parents.get(id)!;
    }
    for (const visited of path) resolved.add(visited);
  }
  return true;
}
export const isExecutionTask = (task: TaskHierarchy) => task.summaryOnly !== true;
