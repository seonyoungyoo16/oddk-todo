import type { Plan, Task } from "../../supabase/functions/_shared/plan.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { addCalendarDays, isClock, isPlanDate, clockMinute } from "../../supabase/functions/_shared/calendar.ts";
import { routeKey, validRouteEstimate, validTravelPlace } from "../../supabase/functions/_shared/travel-query.ts";
import type { RouteEstimate, TravelMode, TravelPlace } from "../../supabase/functions/_shared/travel-query.ts";
import { sameValue } from "./json-equality.ts";
export type TravelStop = { id: string; query: string; place: TravelPlace | null; stay: string; manualTravel: string };
export type TravelDraft = { id: string; date: string; departure: string; mode: TravelMode; buffer: string; stops: TravelStop[]; result: RouteEstimate | null };
export type TravelPreview = { draft: TravelDraft; tasks: Task[]; work: number; buffer: number; endDate: string; endTime: string };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validTravelDraft(v: unknown): v is TravelDraft {
  return object(v) && typeof v.id === "string" && /^[a-zA-Z0-9-]{1,40}$/.test(v.id) && ["date", "departure", "buffer"].every(k => typeof v[k] === "string" && v[k].length <= 120) && ["car", "foot", "bike"].includes(String(v.mode)) && (v.result === null || validRouteEstimate(v.result)) && Array.isArray(v.stops) && v.stops.length >= 2 && v.stops.length <= 6 && new Set(v.stops.map(stop => object(stop) ? stop.id : null)).size === v.stops.length && v.stops.every(stop => object(stop) && typeof stop.id === "string" && /^[a-zA-Z0-9-]{1,40}$/.test(stop.id) && ["query", "stay", "manualTravel"].every(k => typeof stop[k] === "string" && stop[k].length <= 120) && (stop.place === null || validTravelPlace(stop.place)));
}
function integer(text: string, label: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(text.trim())) throw new Error(`${label}을 정수로 입력해주세요.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${label}은 ${minimum}~${maximum}분이에요.`);
  return number;
}
const clock = (minute: number) => `${String(Math.floor(minute % 1440 / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function createTravelPreview(draft: TravelDraft): TravelPreview {
  if (!validTravelDraft(draft) || !isPlanDate(draft.date) || !isClock(draft.departure)) throw new Error("여행 날짜와 출발 시각을 확인해주세요.");
  const buffer = integer(draft.buffer, "각 일정에 포함할 여유", 1, 239);
  if (draft.stops.some(stop => !stop.place && stop.query.trim().length < 2)) throw new Error("방문할 장소를 선택하거나 장소 이름을 직접 입력해주세요.");
  const coordinates = draft.stops.flatMap(stop => stop.place ? [stop.place] : []);
  const places = draft.stops.map(stop => stop.place ?? { name: stop.query.trim(), label: `${stop.query.trim()} (사용자 직접 입력·위치 미확인)` });
  const result = coordinates.length === draft.stops.length && draft.result?.key === routeKey(draft.mode, coordinates) && draft.result.mode === draft.mode && draft.result.legs.length === places.length - 1 ? draft.result : null;
  let cursor = clockMinute(draft.departure), work = 0;
  const tasks: Task[] = [];
  function append(id: string, title: string, total: number, notes: string) {
    if (!Number.isInteger(total) || total <= buffer || total > 240) throw new Error("각 일정은 여유를 포함해 2~240분이고 여유보다 길어야 해요. 긴 이동은 직접 구간을 나눠주세요.");
    const date = addCalendarDays(draft.date, Math.floor(cursor / 1440)), end = cursor + total, endDate = addCalendarDays(draft.date, Math.floor(end / 1440));
    if (!date || !endDate) throw new Error("종료 날짜가 지원하는 달력 범위를 넘어요.");
    tasks.push({ id, title, notes, plannedDate: date, startTime: clock(cursor), endTime: clock(end), endDate, endDayOffset: date === endDate ? 0 : 1, minutes: total, bufferMinutes: buffer, done: false, priority: "normal", importance: "normal", dueDate: null, dueTime: null });
    cursor = end; work += total - buffer;
  }
  for (let i = 1; i < draft.stops.length; i++) {
    const stop = draft.stops[i], manual = stop.manualTravel.trim() !== "";
    const travel = manual ? integer(stop.manualTravel, "직접 정한 이동 시간", 1, 239) : result ? Math.max(1, Math.ceil(result.legs[i - 1].seconds / 60)) : null;
    if (travel === null) throw new Error("이동 시간을 조회하거나 구간별 이동 시간을 직접 입력해주세요.");
    const from = places[i - 1], to = places[i];
    append(`travel:${draft.id}:${stop.id}`, `이동 · ${from.name.slice(0, 35)} → ${to.name.slice(0, 35)}`, travel + buffer, `${from.label} → ${to.label}\n이동 수단: ${draft.mode}\n${manual ? "이동 시간: 사용자 직접 입력" : `출처: OSRM/FOSSGIS · 조회 ${result!.queriedAt} · 경로 이동 ${travel}분(올림)`}\n여유 ${buffer}분 포함. 실시간 교통·출발 시각별 혼잡은 반영하지 않음.`);
    const stay = integer(stop.stay, `${to.name} 체류 시간(여유 포함)`, 0, 240);
    if (stay) append(`visit:${draft.id}:${stop.id}`, `방문 · ${to.name.slice(0, 80)}`, stay, `${to.label}\n체류 시간: 사용자 직접 입력 ${stay}분(여유 ${buffer}분 포함).`);
  }
  return { draft: structuredClone(draft), tasks, work, buffer: buffer * tasks.length, endDate: tasks.at(-1)!.endDate!, endTime: clock(cursor) };
}
export function applyTravelPreview(plan: Plan, preview: TravelPreview, currentDraft: TravelDraft): Plan {
  if (!sameValue(currentDraft, preview.draft) || !sameValue(createTravelPreview(currentDraft), preview)) throw new Error("미리보기 이후 입력이 바뀌었어요. 다시 미리 본 뒤 반영해주세요.");
  if (preview.tasks.some(task => plan.tasks.some(existing => existing.id === task.id))) throw new Error("이미 반영한 여행 계획이에요. 기존 일정을 수정하거나 실행 취소 후 다시 반영해주세요.");
  const next = { ...plan, tasks: [...plan.tasks, ...preview.tasks] };
  if (!validPlan(next)) throw new Error("일정 한도와 시간을 확인해주세요. 기존 계획은 유지했어요.");
  return next;
}
