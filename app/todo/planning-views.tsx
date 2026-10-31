"use client";
import { AutoTextarea } from "./auto-textarea";
import { sortTasks, taskImportance } from "./task-order";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { HiOutlineArrowRight, HiOutlineXMark } from "react-icons/hi2";

import type { Task, Mandala } from "../../supabase/functions/_shared/plan";
import { hasTaskTime, validMandala } from "../../supabase/functions/_shared/plan";
import type { DayPlan } from "./day-selectors";
import { keepFocusInDialog } from "./dialog-focus";
const emptyMandala = (): Mandala => ({ goal: "", areas: Array.from({ length: 8 }, () => ({ title: "", taskIds: Array(8).fill("") })) });
export function safeMandala(value: Mandala | undefined): Mandala {
  return validMandala(value) ? value : emptyMandala();
}
const positions = [0, 1, 2, 3, 5, 6, 7, 8];
const validTime = hasTaskTime;
const labels = { high: "높음", normal: "보통", low: "낮음" };

export function MandalaView({ tasks, draft, dirty, onChange, onSave, onEdit }: { tasks: Task[]; draft: Mandala; dirty: boolean; onChange: (value: Mandala) => void; onSave: (value: Mandala) => boolean; onEdit: (task: Task) => void }) {
  const [message, setMessage] = useState("");
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const statusId = useId();
  const resetDialog = useRef<HTMLDialogElement>(null);
  const plannerScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = plannerScroll.current;
    if (!element) return;
    let previousWidth = 0, previousTotal = 0, frame = 0;
    const measure = () => {
      if (!element.clientWidth) return;
      const canvas = element.parentElement!, hint = canvas.querySelector<HTMLElement>(".oddk-mandalaPlannerHint");
      const main = element.closest("main"), number = (value: string | undefined) => Number.parseFloat(value ?? "0") || 0;
      const reserved = number(getComputedStyle(canvas).paddingBottom) + (hint?.offsetHeight ?? 0) + (hint ? number(getComputedStyle(hint).marginTop) : 0) + (main ? number(getComputedStyle(main).paddingBottom) : 0) + 8;
      const available = Math.max(240, Math.floor(window.innerHeight - element.getBoundingClientRect().top - reserved));
      setFitHeight(window.innerWidth >= 900 ? available : null);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (element.clientWidth === previousWidth && element.scrollWidth === previousTotal) return;
        previousWidth = element.clientWidth; previousTotal = element.scrollWidth;
        element.scrollLeft = Math.max(0, (previousTotal - previousWidth) / 2);
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(element.parentElement!);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); cancelAnimationFrame(frame); };
  }, []);
  const hasGoal = Boolean(draft.goal.trim());
  const activeAreas = draft.areas.map(area => hasGoal && Boolean(area.title.trim()));
  const linkedIds = new Set(draft.areas.flatMap(area => area.taskIds).filter(Boolean));
  const availableTasks = tasks.filter(task => !linkedIds.has(task.id));
  const change = (next: Mandala) => { onChange(next); setMessage(""); };
  function areaTitle(index: number, title: string) {
    change({ ...draft, areas: draft.areas.map((area, i) => i === index ? { ...area, title } : area) });
  }
  function cell(areaIndex: number, cellIndex: number) {
    const area = draft.areas[areaIndex];
    const disabled = !activeAreas[areaIndex];
    if (disabled) return <div className="oddk-mandalaCell" data-inactive="true" aria-hidden="true" key={`cell-${cellIndex}`} />;
    const id = area.taskIds[cellIndex] ?? "";
    const task = tasks.find((item) => item.id === id);
    const connect = (taskId: string) => change({ ...draft, areas: draft.areas.map((item, i) => i === areaIndex ? { ...item, taskIds: Array.from({ length: 8 }, (_, j) => j === cellIndex ? taskId : item.taskIds[j] ?? "") } : item) });
    return <div className="oddk-mandalaCell" data-done={task?.done} key={`cell-${cellIndex}`}>
      {task ? <><button className="oddk-mandalaTask" type="button" disabled={disabled} aria-label={`${task.title} 수정`} aria-describedby={task.done ? `${statusId}-${areaIndex}-${cellIndex}` : undefined} onClick={() => onEdit(task)}><span>{task.title}</span></button>
        {task.done && <span id={`${statusId}-${areaIndex}-${cellIndex}`} className="oddk-srOnly">완료한 할 일</span>}
        <button className="oddk-mandalaUnlink" type="button" disabled={disabled} aria-label={`${areaIndex + 1}번 목표의 실행 ${cellIndex + 1} 연결 해제`} title="할 일 연결 해제" onClick={() => connect("")}><HiOutlineXMark aria-hidden="true" /></button></> : <select disabled={disabled} aria-label={`${areaIndex + 1}번 목표의 실행 ${cellIndex + 1}`} value={id} onChange={(event) => connect(event.target.value)}>
        <option value="">-</option>{id && !task && <option value={id}>연결된 할 일을 찾을 수 없어요</option>}{availableTasks.map((item) => <option key={item.id} value={item.id}>[{item.summaryOnly ? "요약" : item.done ? "완료" : "진행 중"}] {item.title}</option>)}
      </select>}
    </div>;
  }
  function centerCell(index: number) {
    if (index === 4) return <label key={index} className="oddk-mandalaGoal"><span className="oddk-mandalaFieldLabel">핵심 목표</span><AutoTextarea aria-label="핵심 목표" maxLength={100} value={draft.goal} placeholder="목표 입력" onChange={event => change({ ...draft, goal: event.target.value })} /></label>;
    const areaIndex = positions.indexOf(index), area = draft.areas[areaIndex];
    return <label key={index} className="oddk-mandalaSubgoal" data-disabled={!hasGoal} data-filled={Boolean(area.title.trim())}><span className="oddk-mandalaFieldLabel">세부 목표 {areaIndex + 1}</span><AutoTextarea disabled={!hasGoal} aria-label={`세부 목표 ${areaIndex + 1}`} maxLength={60} value={area.title} onChange={event => areaTitle(areaIndex, event.target.value)} placeholder="목표 입력" /></label>;
  }
  return <section className="oddk-planningView" aria-labelledby="mandala-title">
    <h2 id="mandala-title" className="oddk-srOnly">만다라트 8×8</h2>
    <form onSubmit={(event) => { event.preventDefault(); if (onSave(draft)) { setMessage(""); } else setMessage("저장하지 못했어요. 다시 시도해주세요."); }}>
      <header className="oddk-mandalaToolbar">
        <div className="oddk-viewActions oddk-mandalaActions"><button className="oddk-mandalaReset" type="button" onClick={() => resetDialog.current?.showModal()}>전체초기화</button><button className="oddk-primary" type="submit" disabled={!dirty}>목표 저장</button></div>
      </header>
      {message && <p role="status" className="oddk-mandalaFeedback">{message}</p>}
      <div className="oddk-mandalaCanvas" data-expanded="true" data-layout="planner" data-partial={activeAreas.some(active => !active)}>
      <div ref={plannerScroll} className="oddk-mandalaScroll" data-fit={fitHeight !== null} style={fitHeight === null ? undefined : { "--planner-fit-height": `${fitHeight}px` } as CSSProperties} tabIndex={0} role="region" aria-label="전체 만다라트 플래너. 작은 화면에서는 좌우로 스크롤할 수 있어요."><div className="oddk-mandalaBoard" data-expanded="true">
        {Array.from({ length: 9 }, (_, boardIndex) => {
          if (boardIndex === 4) return <div key="center" role="group" aria-label="핵심 목표와 세부 목표" className="oddk-mandalaGroup oddk-mandalaCenter" style={{ gridArea: "2 / 2" }}>
          {Array.from({ length: 9 }, (_, i) => centerCell(i))}
        </div>;
          const areaIndex = positions.indexOf(boardIndex), area = draft.areas[areaIndex], active = activeAreas[areaIndex];
          return <div key={boardIndex} role="group" aria-label={`세부 목표 ${areaIndex + 1} 실행 계획`} aria-hidden={!active} inert={!active} aria-disabled={!active} data-disabled={!active} data-visible={active} className="oddk-mandalaGroup" style={{ gridRow: Math.floor(boardIndex / 3) + 1, gridColumn: boardIndex % 3 + 1 }}>
            {Array.from({ length: 9 }, (_, i) => i === 4 ? <div key={i} className="oddk-mandalaSubgoal" title={area.title}><span className="oddk-mandalaFieldLabel">세부 목표 {areaIndex + 1}</span>{area.title && <strong>{area.title}</strong>}</div> : cell(areaIndex, positions.indexOf(i)))}
          </div>;
        })}
      </div></div>
      </div>
    </form>
    <dialog ref={resetDialog} className="oddk-dialog" aria-labelledby="mandala-reset-title" onKeyDown={keepFocusInDialog} onClick={event => { if (event.target === event.currentTarget) resetDialog.current?.close(); }}>
      <form className="oddk-dialogForm" onSubmit={event => { event.preventDefault(); change(emptyMandala()); resetDialog.current?.close(); }}>
        <header className="oddk-dialogHeader"><h2 id="mandala-reset-title">만다라트 전체초기화</h2><button type="button" aria-label="초기화 창 닫기" onClick={() => resetDialog.current?.close()}><HiOutlineXMark aria-hidden="true" /></button></header>
        <p>핵심 목표, 세부 목표, 할 일 연결을 모두 비울까요?</p><p>할 일 목록은 그대로 남아요. 목표 저장을 누르면 반영돼요.</p>
        <div className="oddk-dialogActions"><button type="button" onClick={() => resetDialog.current?.close()}>취소</button><button type="submit" className="oddk-primary">초기화</button></div>
      </form>
    </dialog>
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
    {selectedTask && <div className="oddk-alpenSelected"><div><small>이어서 계획할 일{selectedTask.done ? " · 완료" : ""}</small><strong>{selectedTask.title}</strong><span>{validTime(selectedTask) ? `작업 ${selectedTask.minutes! - selectedTask.bufferMinutes!}분 + 여유 ${selectedTask.bufferMinutes}분` : "작업·여유 시간을 설정해주세요."}</span></div><button ref={selectedButton} type="button" onClick={() => onEdit(selectedTask)}>시간·중요도 수정<HiOutlineArrowRight aria-hidden="true" /></button></div>}
    <div className="oddk-alpenGrid">
      <article><span className="oddk-step">A</span><h3>할 일 모으기</h3><p>진행 중 {active.length}개 · 완료 {day.completedCount}개</p><button type="button" onClick={onList}>목록에서 추가하기<HiOutlineArrowRight /></button></article>
      <article><span className="oddk-step">L</span><h3>소요 시간 정하기</h3><p>계획한 수행 시간 <strong>{total}분</strong></p>{day.activeUntimedCount > 0 && <p>시간을 정하지 않은 일 {day.activeUntimedCount}개</p>}<small>아래 할 일을 눌러 시간을 설정하세요.</small></article>
      <article><span className="oddk-step">P</span><h3>여유 확보하기</h3><p>작업 {day.activeWork}분 + 여유 <strong>{buffer}분</strong></p><small>입력한 여유는 수행 시간에 포함돼요.</small></article>
      <article><span className="oddk-step">E</span><h3>중요도와 시간 배치</h3><p>중요도 높음 {day.highImportanceCount}개 · 배치 완료 {day.scheduled.length}개</p><button type="button" onClick={onRhythm}>시간표 확인하기<HiOutlineArrowRight /></button></article>
    </div>
    <h3 className="oddk-viewSubheading">실행할 일</h3>
    {active.length ? <ul className="oddk-planTaskList">{sortTasks(active, "importance").map((task) => <li key={task.id}><button type="button" onClick={() => onEdit(task)}><strong>{task.title}</strong><span>중요도 {labels[taskImportance(task)]} · {task.dueDate && `마감 ${task.dueDate}${task.dueTime ? " " + task.dueTime : ""} · `} {validTime(task) ? `작업 ${task.minutes! - task.bufferMinutes!} + 여유 ${task.bufferMinutes}분` : "시간 설정"} · {task.startTime || "시작 시간 설정"}</span></button></li>)}</ul> : <p className="oddk-viewEmpty">진행 중인 일이 없어요. 목록에서 할 일을 추가해주세요.</p>}

  </section>;
}

export function TimeStatsView({ day }: { day: DayPlan }) {
  const { tasks, total, buffer, completedMinutes: done } = day;
  return <section className="oddk-planningView" aria-labelledby="stats-title"><h2 id="stats-title" className="oddk-srOnly">일일 시간통계</h2>
    <div className="oddk-viewContext"><span className="oddk-contextBadge">계획 시간 기준</span><span>선택 날짜 기준 · 완료 포함 · 실제 측정 시간 제외</span></div>
    <div className="oddk-statCards">{[["총 계획 시간", total], ["작업", day.work], ["여유", buffer], ["완료한 일의 계획 시간", done]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}<small>분</small></strong></article>)}</div>
    <h3 className="oddk-viewSubheading">작업과 여유의 비율</h3>{total ? <><div className="oddk-statRatio" role="img" aria-label={`작업 ${total - buffer}분, 여유 ${buffer}분`}><span style={{ width: `${(total - buffer) / total * 100}%` }} /><span style={{ width: `${buffer / total * 100}%` }} /></div><p>작업 {Math.round((total - buffer) / total * 100)}% · 여유 {Math.round(buffer / total * 100)}%</p></> : <p className="oddk-viewEmpty">할 일에 시간을 설정하면 통계가 표시돼요.</p>}
    <h3 className="oddk-viewSubheading">중요도별 계획 시간</h3><div className="oddk-statPriorities">{(["high", "normal", "low"] as const).map((priority) => { const minutes = day.byImportance[priority]; return <div key={priority}><span>{labels[priority]}</span><progress aria-label={`${labels[priority]} 중요도 계획 시간`} value={minutes} max={total || 1} /><strong>{minutes}분</strong></div>; })}</div>
    <p>완료 {day.completedCount} / 전체 {tasks.length}개 · 시간 미설정 {day.untimedCount}개</p>
  </section>;
}
