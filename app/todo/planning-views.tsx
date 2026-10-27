"use client";

import { useEffect, useRef, useState } from "react";
import { HiOutlineArrowRight, HiOutlineCheck } from "react-icons/hi2";

import type { Task, Mandala } from "../../supabase/functions/_shared/plan";
import { hasTaskTime, validMandala } from "../../supabase/functions/_shared/plan";
import type { DayPlan } from "./day-selectors";
const emptyMandala = (): Mandala => ({ goal: "", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) });
export function safeMandala(value: Mandala | undefined): Mandala {
  return validMandala(value) ? value : emptyMandala();
}
const positions = [0, 1, 2, 3, 5, 6, 7, 8];
const validTime = hasTaskTime;
const labels = { high: "높음", normal: "보통", low: "낮음" };

export function MandalaView({ tasks, draft, dirty, onChange, onSave, onEdit, onList }: { tasks: Task[]; draft: Mandala; dirty: boolean; onChange: (value: Mandala) => void; onSave: (value: Mandala) => boolean; onEdit: (task: Task) => void; onList: () => void }) {
  const [message, setMessage] = useState("");
  const change = (next: Mandala) => { onChange(next); setMessage(""); };
  function areaTitle(index: number, title: string) {
    change({ ...draft, areas: draft.areas.map((area, i) => i === index ? { ...area, title } : area) });
  }
  function cell(areaIndex: number, cellIndex: number) {
    const area = draft.areas[areaIndex];
    const id = area.taskIds[cellIndex] ?? "";
    const task = tasks.find((item) => item.id === id);
    return <div className="oddk-mandalaCell" data-done={task?.done} key={`cell-${cellIndex}`}>
      <select aria-label={`${areaIndex + 1}번 목표의 실행 ${cellIndex + 1}`} value={task ? id : ""} onChange={(event) => change({ ...draft, areas: draft.areas.map((item, i) => i === areaIndex ? { ...item, taskIds: Array.from({ length: 8 }, (_, j) => j === cellIndex ? event.target.value : item.taskIds[j] ?? "") } : item) })}>
        <option value="">할 일 연결</option>{tasks.map((item) => <option key={item.id} value={item.id}>{item.done ? "✓ " : ""}{item.title}</option>)}
      </select>
      {task && <button type="button" onClick={() => onEdit(task)}>{task.done ? <HiOutlineCheck aria-hidden="true" /> : null}상세 수정</button>}
    </div>;
  }
  return <section className="oddk-planningView" aria-labelledby="mandala-title">
    <h2 id="mandala-title" className="oddk-srOnly">만다라트</h2>
    <div className="oddk-viewContext" aria-label="목표 구성"><span>핵심 목표</span><HiOutlineArrowRight aria-hidden="true" /><span>세부 목표 8개</span><HiOutlineArrowRight aria-hidden="true" /><span>실행할 일 64개</span></div>
    <form onSubmit={(event) => { event.preventDefault(); if (onSave(draft)) { setMessage("목표와 연결한 할 일을 저장했어요."); } else setMessage("저장하지 못했어요. 다시 시도해주세요."); }}>
      <div className="oddk-viewActions"><button type="button" onClick={onList}>할 일 추가하러 가기<HiOutlineArrowRight /></button><button className="oddk-primary" type="submit" disabled={!dirty}>목표 저장</button><span role="status">{message || (dirty ? "저장하지 않은 변경사항" : "")}</span></div>
      <div className="oddk-mandalaScroll"><div className="oddk-mandalaBoard">
        {Array.from({ length: 9 }, (_, boardIndex) => boardIndex === 4 ? <div key="center" className="oddk-mandalaGroup oddk-mandalaCenter">
          {Array.from({ length: 9 }, (_, i) => i === 4 ? <label key={i} className="oddk-mandalaGoal">핵심 목표<textarea aria-label="핵심 목표" maxLength={100} value={draft.goal} placeholder="이루고 싶은 목표" onChange={(event) => change({ ...draft, goal: event.target.value })} /></label> : <label key={i} className="oddk-mandalaSubgoal">세부 목표 {positions.indexOf(i) + 1}<textarea aria-label={`세부 목표 ${positions.indexOf(i) + 1}`} maxLength={60} value={draft.areas[positions.indexOf(i)].title} onChange={(event) => areaTitle(positions.indexOf(i), event.target.value)} placeholder="목표 입력" /></label>)}
        </div> : <div key={boardIndex} className="oddk-mandalaGroup">
          {Array.from({ length: 9 }, (_, i) => i === 4 ? <div key={i} className="oddk-mandalaSubgoal"><strong>{draft.areas[positions.indexOf(boardIndex)].title || `세부 목표 ${positions.indexOf(boardIndex) + 1}`}</strong></div> : cell(positions.indexOf(boardIndex), positions.indexOf(i)))}
        </div>)}
      </div></div>
    </form>
  </section>;
}

export function AlpenView({ day, onEdit, onList, onRhythm, selectedTaskId }: { day: DayPlan; onEdit: (task: Task) => void; onList: () => void; onRhythm: () => void; selectedTaskId: string | null }) {
  const { tasks, active, activeTotal: total, activeBuffer: buffer } = day;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const selectedButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selectedTaskId) return;
    const frame = requestAnimationFrame(() => { selectedButton.current?.focus(); selectedButton.current?.scrollIntoView({ block: "nearest" }); });
    return () => cancelAnimationFrame(frame);
  }, [selectedTaskId]);
  return <section className="oddk-planningView" aria-labelledby="alpen-title">
    <h2 id="alpen-title" className="oddk-srOnly">알펜 계획</h2>
    {selectedTask && <div className="oddk-alpenSelected"><div><small>이어서 계획할 일{selectedTask.done ? " · 완료" : ""}</small><strong>{selectedTask.title}</strong><span>{validTime(selectedTask) ? `작업 ${selectedTask.minutes! - selectedTask.bufferMinutes!}분 + 여유 ${selectedTask.bufferMinutes}분` : "작업·여유 시간을 설정해주세요."}</span></div><button ref={selectedButton} type="button" onClick={() => onEdit(selectedTask)}>시간·우선순위 수정<HiOutlineArrowRight aria-hidden="true" /></button></div>}
    <div className="oddk-alpenGrid">
      <article><span className="oddk-step">A</span><h3>할 일 모으기</h3><p>진행 중 {active.length}개 · 완료 {day.completedCount}개</p><button type="button" onClick={onList}>목록에서 추가하기<HiOutlineArrowRight /></button></article>
      <article><span className="oddk-step">L</span><h3>소요 시간 정하기</h3><p>계획한 수행 시간 <strong>{total}분</strong></p>{day.activeUntimedCount > 0 && <p>시간을 정하지 않은 일 {day.activeUntimedCount}개</p>}<small>아래 할 일을 눌러 시간을 설정하세요.</small></article>
      <article><span className="oddk-step">P</span><h3>여유 확보하기</h3><p>작업 {day.activeWork}분 + 여유 <strong>{buffer}분</strong></p><small>입력한 여유는 수행 시간에 포함돼요.</small></article>
      <article><span className="oddk-step">E</span><h3>우선순위와 시간 배치</h3><p>우선순위 높음 {day.highPriorityCount}개 · 배치 완료 {day.scheduled.length}개</p><button type="button" onClick={onRhythm}>시간표 확인하기<HiOutlineArrowRight /></button></article>
    </div>
    <h3 className="oddk-viewSubheading">실행할 일</h3>
    {active.length ? <ul className="oddk-planTaskList">{[...active].sort((a, b) => ["high", "normal", "low"].indexOf(a.priority) - ["high", "normal", "low"].indexOf(b.priority)).map((task) => <li key={task.id}><button type="button" onClick={() => onEdit(task)}><strong>{task.title}</strong><span>{labels[task.priority]} · {validTime(task) ? `작업 ${task.minutes! - task.bufferMinutes!} + 여유 ${task.bufferMinutes}분` : "시간 설정"} · {task.startTime || "시작 시간 설정"}</span></button></li>)}</ul> : <p className="oddk-viewEmpty">진행 중인 일이 없어요. 목록에서 할 일을 추가해주세요.</p>}

  </section>;
}

export function TimeStatsView({ day }: { day: DayPlan }) {
  const { tasks, total, buffer, completedMinutes: done } = day;
  return <section className="oddk-planningView" aria-labelledby="stats-title"><h2 id="stats-title" className="oddk-srOnly">일일 시간통계</h2>
    <div className="oddk-viewContext"><span className="oddk-contextBadge">계획 시간 기준</span><span>선택 날짜 기준 · 완료 포함 · 실제 측정 시간 제외</span></div>
    <div className="oddk-statCards">{[["총 계획 시간", total], ["작업", day.work], ["여유", buffer], ["완료한 일의 계획 시간", done]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}<small>분</small></strong></article>)}</div>
    <h3 className="oddk-viewSubheading">작업과 여유의 비율</h3>{total ? <><div className="oddk-statRatio" role="img" aria-label={`작업 ${total - buffer}분, 여유 ${buffer}분`}><span style={{ width: `${(total - buffer) / total * 100}%` }} /><span style={{ width: `${buffer / total * 100}%` }} /></div><p>작업 {Math.round((total - buffer) / total * 100)}% · 여유 {Math.round(buffer / total * 100)}%</p></> : <p className="oddk-viewEmpty">할 일에 시간을 설정하면 통계가 표시돼요.</p>}
    <h3 className="oddk-viewSubheading">우선순위별 계획 시간</h3><div className="oddk-statPriorities">{(["high", "normal", "low"] as const).map((priority) => { const minutes = day.byPriority[priority]; return <div key={priority}><span>{labels[priority]}</span><progress aria-label={`${labels[priority]} 우선순위 계획 시간`} value={minutes} max={total || 1} /><strong>{minutes}분</strong></div>; })}</div>
    <p>완료 {day.completedCount} / 전체 {tasks.length}개 · 시간 미설정 {day.untimedCount}개</p>
  </section>;
}
