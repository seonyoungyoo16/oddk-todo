export const taskDragType = "application/x-oddk-task";
export const timetableTaskDragType = "application/x-oddk-timetable-task";

export function timetableDropMinute(clientY: number, top: number, pixelsPerMinute: number) {
  if (![clientY, top, pixelsPerMinute].every(Number.isFinite) || pixelsPerMinute <= 0) throw new Error("배치할 시각을 확인해주세요.");
  return Math.max(0, Math.min(1435, Math.floor((clientY - top) / pixelsPerMinute / 5) * 5));
}

export function timetableDropAtPoint(x: number, y: number) {
  const column = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-timetable-date]");
  if (!column?.dataset.timetableDate) return null;
  const minute = timetableDropMinute(y, column.getBoundingClientRect().top, Number(column.dataset.pixelsPerMinute));
  return { date: column.dataset.timetableDate, time: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` };
}
