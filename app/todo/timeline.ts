type Interval = { id: string; start: number; end: number };

export function clockMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function clockLabel(minutes: number) {
  const clock = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return minutes >= 1440 ? `다음 날 ${clock}` : clock;
}

// 같은 날 시작하는 일정의 구간을 비교한다. 자정 이후 종료도 연속된 분으로 유지한다.
export function layoutTimeline<T extends Interval>(intervals: T[], bounds: { start?: number; end?: number; maxEnd?: number } = {}) {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Array<T & { lane: number; columns: number; conflict: boolean }> = [];
  let group: typeof result = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const item of group) item.columns = laneEnds.length;
    result.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const interval of sorted) {
    if (interval.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= interval.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = interval.end;
    group.push({ ...interval, lane, columns: 1, conflict: sorted.some((other) => other.id !== interval.id && interval.start < other.end && other.start < interval.end) });
    groupEnd = Math.max(groupEnd, interval.end);
  }
  flush();
  const requestedStart = bounds.start ?? sorted[0]?.start ?? 540;
  const start = Math.floor(Math.min(requestedStart, sorted[0]?.start ?? requestedStart) / 60) * 60;
  const end = Math.min(bounds.maxEnd ?? Infinity, Math.max(start + 120, Math.ceil(Math.max(bounds.end ?? start, ...sorted.map((item) => item.end)) / 60) * 60));
  return { items: result, start, end, columns: Math.max(1, ...result.map((item) => item.columns)) };
}
