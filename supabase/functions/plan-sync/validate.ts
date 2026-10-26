export function validPlan(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.tasks) || plan.tasks.length > 5000 || typeof plan.start !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.start)) return false;
  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (!task || typeof task.id !== "string" || !task.id || ids.has(task.id) || typeof task.title !== "string" || !task.title.trim() || task.title.length > 120 || typeof task.done !== "boolean" || !["high", "normal", "low"].includes(task.priority)) return false;
    ids.add(task.id);
    for (const key of ["minutes", "bufferMinutes"]) if (task[key] != null && (!Number.isInteger(task[key]) || task[key] < 1 || task[key] > 240)) return false;
    if (task.startTime != null && (typeof task.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.startTime))) return false;
  }
  if (plan.review != null && (typeof plan.review !== "string" || plan.review.length > 2000)) return false;
  if (plan.mandala != null) {
    const m = plan.mandala as { goal: string; areas: Array<{ title: string; taskIds: string[] }> };
    if (!m || typeof m.goal !== "string" || m.goal.length > 100 || !Array.isArray(m.areas) || m.areas.length !== 8 || !m.areas.every((a) => a && typeof a.title === "string" && a.title.length <= 60 && Array.isArray(a.taskIds) && a.taskIds.length === 8 && a.taskIds.every((id) => typeof id === "string" && id.length <= 100))) return false;
  }
  return true;
}
