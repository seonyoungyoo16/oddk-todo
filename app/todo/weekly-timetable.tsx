"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import { isPlanDate } from "../../supabase/functions/_shared/plan";
import { dayLabel, shiftDate } from "./calendar-range";
import { clockLabel } from "./timeline";
import { TimelineScroll, TimelineTask } from "./timeline-task";
import { buildWeeklyTimetable, timetablePastels, timetableTone } from "./weekly-timetable-model";
import { TimetableAddDialog } from "./timetable-add-dialog";
import type { NewTimetableTaskPreview } from "./timetable-add-dialog";
import { timetableTaskDragType, timetableDropMinute } from "./timetable-drag";
import type { PlanningIssue } from "./planning-alert-model";

type Props = { plan: Plan; tasks: Task[]; date: string; today: string; onSelectDate: (date: string) => void; onEdit: (task: Task) => void; onMove: (task: Task, delta: number, days?: number) => void; onResize: (task: Task, minutes: number) => void; onPlace?: (id: string, date: string, time: string) => void; onCreate: (preview: NewTimetableTaskPreview) => string | null; newTaskContext?: { categoryId: string | null; tagIds: string[] }; highlightedIssues?: PlanningIssue[]; focusTaskId?: string };
const pixelsPerMinute = 1;
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const shortDate = (date: string) => date.slice(5).replace("-", ".");

export function WeeklyTimetable({ plan, tasks, date, today, onSelectDate, onEdit, onMove, onResize, onPlace, onCreate, newTaskContext, highlightedIssues = [], focusTaskId }: Props) {
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState<{ date: string; time: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ date: string; minute: number } | null>(null);
  useEffect(() => {
    const clear = () => setDropHint(null);
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => { document.removeEventListener("dragend", clear); document.removeEventListener("drop", clear); };
  }, []);
  const anchor = shiftDate(date, offset * 7) ?? date;
  const days = useMemo(() => buildWeeklyTimetable(plan, anchor, tasks), [plan, anchor, tasks]);
  const initialMinute = days.find(day => day.date === date)?.tasks.find(task => task.id === focusTaskId)?.start ?? Math.min(540, ...(days.find(day => day.date === date)?.tasks ?? []).map(task => task.start));
  const shortTasks = days.flatMap(day => day.tasks.filter(task => task.segmentMinutes < 20).map(task => ({ date: day.date, task })));
  if (!days.length) return <p>시간표를 불러오고 있어요.</p>;

  return <section className="oddk-weekTable" aria-label="주간 시간표">
    <header className="oddk-weekToolbar"><div><h2 id="rhythm-title">주간 시간표</h2><p>{shortDate(days[0].date)} – {shortDate(days.at(-1)!.date)}</p></div><nav aria-label="시간표 주 이동"><button type="button" aria-label="이전 주" disabled={!shiftDate(anchor, -7)} onClick={() => setOffset(value => value - 1)}><HiOutlineChevronLeft aria-hidden="true" /></button><button type="button" onClick={() => { setOffset(0); if (isPlanDate(today)) onSelectDate(today); }}>오늘</button><button type="button" aria-label="다음 주" disabled={!shiftDate(anchor, 7)} onClick={() => setOffset(value => value + 1)}><HiOutlineChevronRight aria-hidden="true" /></button></nav></header>
    <div className="oddk-weekMeta"><span className="oddk-pastelLegend"><i /><i /><i /><span>작업 + 여유</span></span><span className="oddk-weekAddHint">빈 칸에서 추가 · 목록에서 끌어 놓기</span></div>
    <TimelineScroll key={anchor} initialMinute={initialMinute} pixelsPerMinute={pixelsPerMinute} initialDay={Math.max(0, days.findIndex(day => day.date === date))} label="요일별 주간 시간표. 일정 클릭으로 수정, 드래그로 시간 이동, 아래쪽 드래그로 소요시간 조절, 빈 시간 클릭으로 할 일 추가.">
      <div className="oddk-weekCanvas">
        <div className="oddk-weekHeader"><span className="oddk-weekCorner" aria-hidden="true" />{days.map((day, index) => <button key={day.date} type="button" data-today={day.date === today} data-selected={day.date === date} aria-label={`${dayLabel(day.date)} 할 일 보기`} aria-current={day.date === date ? "date" : undefined} onClick={() => onSelectDate(day.date)}><span>{weekdays[index]}</span><strong>{Number(day.date.slice(-2))}</strong></button>)}</div>
        <div className="oddk-weekBody" style={{ height: 1440 * pixelsPerMinute }}>
          <div className="oddk-weekTimes" aria-hidden="true">{Array.from({ length: 24 }, (_, hour) => <time key={hour} style={{ top: hour * 60 * pixelsPerMinute }}>{String(hour).padStart(2, "0")}</time>)}</div>
          <div className="oddk-weekColumns">{days.map(day => <div key={day.date} className="oddk-weekColumn" data-date={day.date} data-timetable-date={onPlace ? day.date : undefined} data-pixels-per-minute={pixelsPerMinute} data-selected={day.date === date}
            onDragOver={event => {
              if (!onPlace || !event.dataTransfer.types.includes(timetableTaskDragType)) return;
              event.preventDefault(); event.dataTransfer.dropEffect = "move";
              const minute = timetableDropMinute(event.clientY, event.currentTarget.getBoundingClientRect().top, pixelsPerMinute);
              setDropHint(current => current?.date === day.date && current.minute === minute ? current : { date: day.date, minute });
              const scroll = event.currentTarget.closest<HTMLElement>(".oddk-timelineScroll");
              if (scroll) { const rect = scroll.getBoundingClientRect(); if (event.clientY > rect.bottom - 36) scroll.scrollTop += 12; else if (event.clientY < rect.top + 80) scroll.scrollTop -= 12; }
            }}
            onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropHint(null); }}
            onDrop={event => {
              if (!onPlace || !event.dataTransfer.types.includes(timetableTaskDragType)) return;
              event.preventDefault(); event.stopPropagation(); setDropHint(null);
              const id = event.dataTransfer.getData(timetableTaskDragType);
              if (id) onPlace(id, day.date, clockLabel(timetableDropMinute(event.clientY, event.currentTarget.getBoundingClientRect().top, pixelsPerMinute)));
            }}>
            <button className="oddk-weekBlank" type="button" aria-label={`${dayLabel(day.date)} 빈 시간에 할 일 추가`} onClick={event => {
              const minute = event.detail === 0 ? 540 : Math.max(0, Math.min(1435, Math.floor((event.clientY - event.currentTarget.getBoundingClientRect().top) / pixelsPerMinute / 5) * 5));
              setAdding({ date: day.date, time: clockLabel(minute) });
            }} />
            {dropHint?.date === day.date && <div className="oddk-weekDropMarker" style={{ top: dropHint.minute * pixelsPerMinute }} aria-hidden="true"><span>{clockLabel(dropHint.minute)}</span></div>}
            {day.fixed.map(block => <div key={block.id} className="oddk-weekFixed" style={{ top: block.start * pixelsPerMinute, height: (block.end - block.start) * pixelsPerMinute }} title={`${block.title} · ${clockLabel(block.start)}–${clockLabel(block.end)}`}><strong>{block.title}</strong><span>고정·휴식</span></div>)}
            {day.tasks.map(task => {
              const tone = timetablePastels[timetableTone(task)];
              const issue = day.date === date ? highlightedIssues.find(issue => issue.id === task.id) : undefined;
              const description = `${dayLabel(day.date)}, ${task.title}, ${clockLabel(task.start)}부터 ${clockLabel(task.end)}, 작업 ${task.segmentWork}분, 여유 ${task.segmentBuffer}분${task.continuesBefore ? ", 전날부터 이어짐" : ""}${task.continuesAfter ? ", 다음 날 계속" : ""}${task.conflict ? ", 시간 겹침" : ""}`;
              return <TimelineTask key={task.id} taskId={task.id} highlighted={Boolean(issue)} title={task.title} notes={task.notes} description={description + (issue ? `, ${issue.reasons.join(" · ")}` : "")} start={task.start} end={task.end} pixelsPerMinute={pixelsPerMinute} conflict={task.conflict} onEdit={() => onEdit(task)} sourceDate={day.date} onMove={(delta, dayOffset) => onMove(task, delta, dayOffset)} duration={!task.continuesAfter ? { minutes: task.minutes!, bufferMinutes: task.bufferMinutes! } : undefined} onResize={minutes => onResize(task, minutes)} style={{ top: task.start * pixelsPerMinute, height: task.segmentMinutes * pixelsPerMinute, left: `${task.lane / task.columns * 100}%`, width: `${100 / task.columns}%`, "--tt-fill": tone.fill, "--tt-ink": tone.ink, "--tt-dark-fill": tone.darkFill, "--tt-dark-ink": tone.darkInk } as CSSProperties}>
                {delta => {
                  const segment = Math.max(0, task.segmentMinutes + delta), buffer = delta === 0 ? task.segmentBuffer : Math.min(task.bufferMinutes!, segment), work = segment - buffer;
                  return <>{issue && <span className="oddk-timetableIssueBadge" aria-hidden="true">!</span>}{work > 0 && <span className="oddk-slotWork" style={{ height: work * pixelsPerMinute }}><strong>{task.title}</strong><span>{clockLabel(task.start)}–{clockLabel(task.end + delta)}</span>{task.conflict && <span>시간 겹침</span>}</span>}
                    {buffer > 0 && <span className="oddk-slotBuffer" style={{ height: buffer * pixelsPerMinute }}>{!work && <strong>{task.title}</strong>}<span>여유 {buffer}분</span></span>}</>;
                }}
              </TimelineTask>;
            })}
          </div>)}</div>
        </div>
      </div>
    </TimelineScroll>
    {!days.some(day => day.tasks.length || day.fixed.length) && <p className="oddk-weekEmpty">빈 시간을 클릭해 이 주의 할 일을 추가해보세요.</p>}
    {shortTasks.length > 0 && <div className="oddk-weekShort" aria-label="짧은 일정">{shortTasks.map(({ date: taskDate, task }) => <button key={`${taskDate}:${task.id}`} type="button" onClick={() => onEdit(task)}>{shortDate(taskDate)} {clockLabel(task.start)} · {task.title}</button>)}</div>}
    {adding && <TimetableAddDialog plan={plan} date={adding.date} time={adding.time} context={newTaskContext} onClose={() => setAdding(null)} onCreate={onCreate} />}
  </section>;
}
