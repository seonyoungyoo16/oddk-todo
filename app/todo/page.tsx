"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { HiOutlinePlus, HiOutlineXMark, HiOutlineCheck, HiOutlineMinus, HiOutlineTrash, HiOutlineArrowUturnLeft, HiOutlineClipboardDocumentCheck, HiOutlineSun, HiOutlineListBullet, HiOutlineSquares2X2, HiOutlineChartBar, HiOutlineClock, HiOutlineChevronDown } from "react-icons/hi2";
import { GoDotFill } from "react-icons/go";
import "./todo.css";
import "./task-editor.css";
import { TaskTimeFields } from "./task-time-fields";
import { parseTaskTimeDraft, workFromStoredTime } from "./task-time";
import { layoutTimeline } from "./timeline";
import { MandalaView, AlpenView, TimeStatsView, safeMandala } from "./planning-views";
import type { Mandala, Plan, Task, Priority } from "../../supabase/functions/_shared/plan";
import { hasTaskTime, isClock, validPlan } from "../../supabase/functions/_shared/plan";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration";
import initialPlan from "./initial-plan.json";
import { SyncPanel } from "./sync-panel";
import { getPlanSnapshot, subscribePlan, writePlan, exportPlanBackup, restoreLastValidPlan } from "./sync-store";

type View = "list" | "rhythm" | "mandala" | "alpen" | "stats";
const views: Array<{ id: View; label: string }> = [
  { id: "list", label: "할 일 리스트" }, { id: "rhythm", label: "오늘의 리듬" },
  { id: "mandala", label: "만다라트" }, { id: "alpen", label: "알펜" }, { id: "stats", label: "일일 시간통계" },
];
const viewHeaders: Record<View, { title: string; description: string }> = {
  list: { title: "생각나는 태스크를 모두 적어주세요.", description: "목표는 무엇을 끝낼지 명확히 하고, 막히는 일을 빨리 발견하는 것" },
  rhythm: { title: "오늘 할 일을 시간에 맞춰 배치해요.", description: "작업할 시간과 여유 시간을 나누고, 겹치는 일정이 없는지 확인해요." },
  mandala: { title: "큰 목표를 작은 실행으로 나눠요.", description: "핵심 목표에서 세부 목표로, 세부 목표에서 실행할 일로 연결해요." },
  alpen: { title: "무리 없이 끝낼 수 있는 하루를 계획해요.", description: "할 일과 소요 시간을 정하고, 여유와 우선순위를 반영한 뒤 하루를 돌아봐요." },
  stats: { title: "오늘의 시간 계획을 한눈에 확인해요.", description: "작업과 여유에 배분한 시간, 완료한 일의 계획 시간을 살펴봐요." },
};
type Filter = "all" | "active" | "done";

const THEME_KEY = "oddk.theme.v1";
const THEME_EVENT = "oddk-theme-change";
const EMPTY_PLAN: Plan = initialPlan as Plan;
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_PLAN);
const priorities: Record<Priority, { label: string; order: number }> = {
  high: { label: "높음", order: 0 },
  normal: { label: "보통", order: 1 },
  low: { label: "낮음", order: 2 },
};

// 서버와 브라우저의 첫 화면을 일치시키고, 저장된 목록은 브라우저에서 읽는다.
function subscribe(notify: () => void) {
  return subscribePlan(notify);
}

function getSnapshot() {
  return getPlanSnapshot(EMPTY_SNAPSHOT);
}

function subscribeTheme(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(THEME_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(THEME_EVENT, notify);
  };
}

function getThemeSnapshot() {
  try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

const hasTime = hasTaskTime;

function clockMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function clockLabel(minutes: number) {
  const clock = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return minutes >= 1440 ? `다음 날 ${clock}` : clock;
}

function SelectionCheckbox({ label, checked, mixed = false, round = false, disabled = false, onChange, id }: {
  label: string; checked: boolean; mixed?: boolean; round?: boolean; disabled?: boolean; onChange: () => void; id?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <label className={"oddk-selectionCheckbox" + (round ? " oddk-roundCheckbox" : "")}>
    <input ref={input} id={id} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} />
    <span aria-hidden="true" data-mixed={mixed}>{mixed ? <HiOutlineMinus /> : checked ? <HiOutlineCheck /> : null}</span>
  </label>;
}

export default function Todo() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
  const planLoad = useMemo(() => loadPlan(snapshot), [snapshot]);
  const plan = planLoad.ok ? planLoad.plan : EMPTY_PLAN;
  const savedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "light");
  const [themeOverride, setThemeOverride] = useState<"light" | "dark" | null>(null);
  const theme = themeOverride ?? savedTheme;
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("list");
  const [selectionMode, setSelectionMode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editWork, setEditWork] = useState("");
  const [editBuffer, setEditBuffer] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("normal");
  const [editDone, setEditDone] = useState(false);
  const [editError, setEditError] = useState("");
  const [mandalaDraft, setMandalaDraft] = useState<Mandala | null>(null);
  const mandala = mandalaDraft ?? safeMandala(plan.mandala);
  const [editLinks, setEditLinks] = useState<string[]>([]);
  const [linkArea, setLinkArea] = useState("");
  const [linkSlot, setLinkSlot] = useState("");
  const [alpenTaskId, setAlpenTaskId] = useState<string | null>(null);
  const [deletedTasks, setDeletedTasks] = useState<Array<{ task: Task; index: number }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editingTask = plan.tasks.find((task) => task.id === editingId);
  const editingTaskId = editingTask?.id;
  const editTime = parseTaskTimeDraft(editWork, editBuffer);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (editingTaskId && !dialog.open) {
      dialog.showModal();
      editInputRef.current?.focus();
    }
    if (!editingTaskId && dialog.open) dialog.close();
  }, [editingTaskId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const active = plan.tasks.filter((task) => !task.done);
  const doneCount = plan.tasks.length - active.length;
  const timedTasks = active.filter(hasTime);
  const workMinutes = timedTasks.reduce((sum, task) => sum + task.minutes, 0);
  const bufferMinutes = timedTasks.reduce((sum, task) => sum + task.bufferMinutes, 0);
  const noKnownTimes = active.length > 0 && timedTasks.length === 0;
  const progress = plan.tasks.length ? Math.round(doneCount / plan.tasks.length * 100) : 0;
  const rhythmTasks = timedTasks.filter((task) => task.startTime !== null)
    .map((task) => ({ ...task, start: clockMinutes(task.startTime!), end: clockMinutes(task.startTime!) + task.minutes }))
    .sort((a, b) => a.start - b.start);
  const timeline = layoutTimeline(rhythmTasks);
  const pixelsPerMinute = 3;
  const visibleTasks = plan.tasks
    .filter((task) => filter === "all" || (filter === "done" ? task.done : !task.done))
    .sort((a, b) => Number(a.done) - Number(b.done));
  const selectedTasks = visibleTasks.filter((task) => selectedIds.has(task.id));
  const allSelected = visibleTasks.length > 0 && selectedTasks.length === visibleTasks.length;
  const allSelectedDone = selectedTasks.length > 0 && selectedTasks.every((task) => task.done);

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
      window.dispatchEvent(new Event(THEME_EVENT));
      setThemeOverride(null);
    } catch { setThemeOverride(next); }
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(visibleTasks.map((task) => task.id)));
  }

  function save(next: Plan, message: string) {
    if (!planLoad.ok) { setError(planLoad.error); return false; }
    if (!validPlan(next)) { setError("할 일과 시간 설정을 확인해주세요."); return false; }
    try {
      writePlan(next);
      setError("");
      setNotice({ message });
      return true;
    } catch {
      setError("브라우저에 저장하지 못했어요. 저장 공간이나 사이트 저장 권한을 확인해주세요.");
      return false;
    }
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = input.trim();
    if (!title) { setError("할 일을 먼저 입력해주세요."); inputRef.current?.focus(); return; }
    if (plan.tasks.some((task) => !task.done && task.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      setError("이미 남아 있는 할 일이에요. 기존 목록을 확인해주세요."); return;
    }
    const task: Task = { id: crypto.randomUUID(), title, minutes: null, bufferMinutes: null, startTime: null, priority: "normal", done: false, plannedDate: null };
    if (save({ ...plan, tasks: [...plan.tasks, task] }, "할 일을 추가했어요.")) {
      setInput(""); setFilter("all"); setSelectedIds(new Set()); setSelectionMode(false); inputRef.current?.focus();
    }
  }

  function deleteTask(task: Task) {
    const index = plan.tasks.findIndex((item) => item.id === task.id);
    if (save({ ...plan, tasks: plan.tasks.filter((item) => item.id !== task.id) }, "할 일을 삭제했어요.")) {
      setDeletedTasks([{ task, index }]);
      setSelectedIds((current) => new Set([...current].filter((id) => id !== task.id)));
      if (editingId === task.id) setEditingId(null);
    }
  }

  function undoDelete() {
    if (deletedTasks.length === 0) return;
    const tasks = [...plan.tasks];
    for (const deleted of [...deletedTasks].sort((a, b) => a.index - b.index)) {
      if (!tasks.some((task) => task.id === deleted.task.id)) tasks.splice(deleted.index, 0, deleted.task);
    }
    if (save({ ...plan, tasks }, "삭제한 할 일을 복원했어요.")) setDeletedTasks([]);
  }

  function deleteSelected() {
    const ids = new Set(selectedTasks.map((task) => task.id));
    if (ids.size === 0) return;
    const deleted = plan.tasks.map((task, index) => ({ task, index })).filter((item) => ids.has(item.task.id));
    if (save({ ...plan, tasks: plan.tasks.filter((task) => !ids.has(task.id)) }, ids.size + "개의 할 일을 삭제했어요.")) {
      setDeletedTasks(deleted);
      setSelectedIds(new Set());
    }
  }

  function completeSelected() {
    const ids = new Set(selectedTasks.map((task) => task.id));
    if (ids.size === 0) return;
    const tasks = plan.tasks.map((task) => ids.has(task.id) ? { ...task, done: !allSelectedDone } : task);
    const titles = tasks.filter((task) => !task.done).map((task) => task.title.toLocaleLowerCase());
    if (allSelectedDone && new Set(titles).size !== titles.length) {
      setError("같은 내용의 진행 중인 항목이 있어 완료를 취소할 수 없어요."); return;
    }
    if (save({ ...plan, tasks }, ids.size + (allSelectedDone ? "개의 완료를 취소했어요." : "개의 할 일을 완료했어요."))) setSelectedIds(new Set());
  }

  function toggleDone(task: Task) {
    if (task.done && plan.tasks.some((item) => item.id !== task.id && !item.done && item.title.toLocaleLowerCase() === task.title.toLocaleLowerCase())) {
      setError("같은 내용의 진행 중인 항목이 있어 완료를 취소할 수 없어요."); return;
    }
    save({ ...plan, tasks: plan.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) },
      task.done ? "완료를 취소했어요." : "하나 끝냈어요. 잘했어요!");
  }

  function changeFilter(value: Filter) {
    changeView("list");
    setFilter(value);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  function changeView(value: View) {
    setView(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openEditor(task: Task) {
    setEditTitle(task.title);
    setEditWork(workFromStoredTime(task.minutes, task.bufferMinutes));
    setEditBuffer(task.bufferMinutes === null ? "" : String(task.bufferMinutes));
    setEditStart(task.startTime ?? "");
    setEditPriority(task.priority);
    setEditDone(task.done);
    setEditLinks(mandala.areas.flatMap((area, a) => area.taskIds.flatMap((id, c) => id === task.id ? [`${a}:${c}`] : [])));
    setLinkArea("");
    setLinkSlot("");
    setEditError("");
    setEditingId(task.id);
  }

  function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) { setEditingId(null); return; }
    const task = editingTask;
    const title = editTitle.trim();
    const { minutes: duration, bufferMinutes: buffer, error: timeError } = editTime;
    if (!title) { setEditError("수정할 내용을 입력해주세요."); return; }
    if (timeError) { setEditError(timeError); return; }
    if (editStart && duration === null) { setEditError("시작 시간을 설정하려면 작업 시간과 여유 시간을 먼저 입력해주세요."); return; }
    if (editStart && !isClock(editStart)) { setEditError("시작 시간을 올바르게 입력해주세요."); return; }
    if (!editDone && plan.tasks.some((item) => item.id !== task.id && !item.done && item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      setEditError("같은 내용의 할 일이 이미 있어요."); return;
    }
    const originalLinks = mandala.areas.flatMap((area, a) => area.taskIds.flatMap((id, c) => id === task.id ? [`${a}:${c}`] : []));
    const linksChanged = originalLinks.length !== editLinks.length || originalLinks.some((link) => !editLinks.includes(link));
    const occupied = editLinks.some((link) => {
      const [a, c] = link.split(":").map(Number);
      const id = mandala.areas[a]?.taskIds[c];
      return id && id !== task.id && plan.tasks.some((item) => item.id === id);
    });
    if (occupied) { setEditError("선택한 실행 칸에 다른 할 일이 있어요. 빈 칸을 선택해주세요."); return; }
    const nextMandala = linksChanged ? { ...mandala, areas: mandala.areas.map((area, a) => ({ ...area, taskIds: area.taskIds.map((id, c) => editLinks.includes(`${a}:${c}`) ? task.id : id === task.id ? "" : id) })) } : plan.mandala;
    const destination = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-destination");
    if (save({ ...plan, mandala: nextMandala, tasks: plan.tasks.map((item) => item.id === task.id ? { ...item, title, minutes: duration, bufferMinutes: buffer, startTime: editStart || null, priority: editPriority, done: editDone } : item) }, "내용을 수정했어요.")) {
      if (linksChanged) setMandalaDraft(null);
      setEditingId(null); setSelectedIds(new Set());
      if (destination === "alpen") { setAlpenTaskId(task.id); changeView("alpen"); }
    }
    else setEditError("저장하지 못했어요. 브라우저의 저장 공간이나 사이트 저장 권한을 확인해주세요.");
  }

  if (!planLoad.ok) return <main className="oddk-page oddk-recovery font-sans" data-theme={theme}><section className="oddk-recoveryCard" role="alert"><h1>저장된 내용을 복구해야 해요</h1><p>{planLoad.error}</p><p>원본은 바꾸지 않았어요. 먼저 백업을 받고 최근 정상 저장본을 복구해보세요. 정상 저장본이 없으면 백업 파일을 보관한 채 데이터 형식 확인이 필요해요.</p><div className="oddk-recoveryActions"><button type="button" onClick={() => exportPlanBackup(EMPTY_SNAPSHOT)}>원본 백업 받기</button><button type="button" onClick={() => { try { restoreLastValidPlan(); } catch (error) { setError((error as Error).message); } }}>최근 정상 저장본 복구</button></div>{error && <p role="status">{error}</p>}</section></main>;

  return (
    <div className="oddk-page font-sans" data-theme={theme}>
      <div className="oddk-window">
        <div className="oddk-windowBody">
          <aside className="oddk-sidebar">
            <Link href="/" className="oddk-brand" aria-label="oddk 홈으로"><Image src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`} alt="oddk" width={1952} height={800} className="oddk-logo" priority /></Link>
            <nav className="oddk-navigation" aria-label="보기 방식">
              {views.map((item) => {
                const Icon = { list: HiOutlineListBullet, rhythm: HiOutlineClock, mandala: HiOutlineSquares2X2, alpen: HiOutlineClipboardDocumentCheck, stats: HiOutlineChartBar }[item.id];
                return <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => changeView(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span></button>;
              })}
            </nav>
            <SyncPanel fallback={EMPTY_SNAPSHOT} />
          </aside>

          <main className="oddk-workspace">
            <button type="button" className="oddk-themeToggle" onClick={toggleTheme} aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}><HiOutlineSun aria-hidden="true" /></button>
            <header className="oddk-intro">
              <h1>{viewHeaders[view].title}</h1>
              <p>{viewHeaders[view].description}</p>
            </header>

            <div className="oddk-contentGrid oddk-singleView">
              <section hidden={view !== "list"} className="oddk-taskArea" aria-labelledby="task-list-title">
                <div className="oddk-sectionHeading">
                  <h2 id="task-list-title" className="oddk-srOnly">할 일 리스트</h2>
                  <div className="oddk-listTabs" role="group" aria-label="할 일 상태">
                    <button type="button" aria-pressed={filter === "all"} onClick={() => changeFilter("all")}>나의 할 일<span>{plan.tasks.length}</span></button>
                    <button type="button" aria-pressed={filter === "active"} onClick={() => changeFilter("active")}>진행 중<span>{active.length}</span></button>
                    <button type="button" aria-pressed={filter === "done"} onClick={() => changeFilter("done")}>완료<span>{doneCount}</span></button>
                  </div>
                  <button className="oddk-selectionToggle" type="button" aria-pressed={selectionMode} onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }}>{selectionMode ? "선택 끝내기" : "선택"}</button>
                </div>

                {selectionMode && <div className="oddk-selectionBar">
                  <SelectionCheckbox label="현재 목록 전체 선택" checked={allSelected} disabled={visibleTasks.length === 0} mixed={selectedTasks.length > 0 && !allSelected} onChange={toggleSelectAll} />
                  <button type="button" disabled={visibleTasks.length === 0} onClick={toggleSelectAll}>전체 선택</button>
                  <span>{selectedTasks.length}개 선택</span>
                </div>}
                {selectionMode && selectedTasks.length > 0 && <div className="oddk-bulkActions" role="group" aria-label="선택 항목 관리">
                  <button type="button" onClick={completeSelected}>{allSelectedDone ? <HiOutlineArrowUturnLeft aria-hidden="true" /> : <HiOutlineCheck aria-hidden="true" />}{allSelectedDone ? "완료 취소" : "선택 완료"}</button>
                  <button type="button" onClick={deleteSelected}><HiOutlineTrash aria-hidden="true" />선택 삭제</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())}><HiOutlineXMark aria-hidden="true" />선택 해제</button>
                </div>}
                {deletedTasks.length > 0 && selectedTasks.length === 0 && <button type="button" className="oddk-undoDelete" onClick={undoDelete}><HiOutlineArrowUturnLeft aria-hidden="true" />삭제 되돌리기</button>}
                {error && <p className="oddk-error" role="alert">{error}</p>}

                {visibleTasks.length === 0 ? <div className="oddk-empty">
                  <HiOutlineClipboardDocumentCheck aria-hidden="true" />
                  <h3>{filter === "done" ? "작은 완료가 쌓일 자리예요" : filter === "active" && doneCount > 0 ? "모든 할 일을 마쳤어요!" : "아직 비어 있는 하루예요"}</h3>
                  <p>{filter === "done" ? "끝낸 일을 체크하면 여기에 보여요." : filter === "active" && doneCount > 0 ? "필요할 때 다음 할 일을 더해보세요." : "첫 번째 할 일을 가볍게 적어보세요."}</p>
                </div> : <ul className="oddk-taskList">
                  {visibleTasks.map((task) => <li key={task.id} className={"oddk-task" + (task.done ? " oddk-completed" : "") + (selectionMode && selectedIds.has(task.id) ? " oddk-selected" : "")}>
                    <SelectionCheckbox id={"task-" + task.id} checked={selectionMode ? selectedIds.has(task.id) : task.done}
                      round={!selectionMode} label={task.title + (selectionMode ? " 선택" : " 완료")}
                      onChange={() => selectionMode ? toggleSelection(task.id) : toggleDone(task)} />
                    <button type="button" className="oddk-taskContent" aria-label={task.title + " 상세 수정"} onClick={() => openEditor(task)}>
                      <span className="oddk-taskTitle" title={task.title}>{task.title}</span>
                      <span className="oddk-taskDetails">
                        <span className={"oddk-taskPriority oddk-" + task.priority}>{priorities[task.priority].label}</span>
                        <span aria-hidden="true" className="oddk-detailDot">·</span>
                        <span className={"oddk-taskTime" + (!hasTime(task) ? " oddk-unset" : "")}
                          title={!hasTime(task) ? "항목을 눌러 시간을 설정해주세요" : "작업 " + (task.minutes - task.bufferMinutes) + "분 / 수행 " + task.minutes + "분, 포함된 여유 " + task.bufferMinutes + "분"}
                          aria-label={!hasTime(task) ? "시간 미설정" : "작업 " + (task.minutes - task.bufferMinutes) + "분, 수행 " + task.minutes + "분, 포함된 여유 " + task.bufferMinutes + "분"}>
                          {hasTime(task) ? <>{task.minutes - task.bufferMinutes} / {task.minutes}<small>분</small></> : "시간 미설정"}
                        </span>
                        {task.startTime && <span className="oddk-taskStart"><HiOutlineClock aria-hidden="true" />{task.startTime}</span>}
                      </span>
                    </button>
                    {task.done && <span className="oddk-doneBadge">완료</span>}
                  </li>)}
                </ul>}

                <form onSubmit={addTask} className="oddk-addForm">
                  <button type="submit" aria-label="할 일 추가"><HiOutlinePlus aria-hidden="true" /></button>
                  <input ref={inputRef} id="todo-input" aria-label="할 일 입력" value={input} onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
                    maxLength={120} placeholder="떠오르는 할 일을 적어보세요" autoComplete="off" />
                </form>

                <div className="oddk-dayProgress">
                  <div><span>전체 {plan.tasks.length}개 중 {doneCount}개 완료</span><strong>{progress}%</strong></div>
                  <progress aria-label="전체 할 일 완료율" max={100} value={progress} />
                </div>
              </section>

              <aside hidden={view !== "rhythm"} className="oddk-rhythm" aria-labelledby="rhythm-title">
                <h2 id="rhythm-title" className="oddk-srOnly">오늘의 리듬</h2>
                <div className="oddk-timeSummary" aria-label="진행 중인 할 일의 설정된 시간">
                  <div><span>수행</span><strong>{noKnownTimes ? "—" : workMinutes}<small>분</small></strong></div>
                  <div><span>작업</span><strong>{noKnownTimes ? "—" : workMinutes - bufferMinutes}<small>분</small></strong></div>
                  <div><span>여유</span><strong>{noKnownTimes ? "—" : bufferMinutes}<small>분</small></strong></div>
                </div>
                {rhythmTasks.length === 0 ? <div className="oddk-rhythmEmpty"><HiOutlineClock aria-hidden="true" /><p>진행 중인 일을 눌러<br />시작 시간을 정해주세요.</p></div> : <>
                  <div className="oddk-timelineLegend" aria-label="시간표 구분"><span><i />작업</span><span><i />여유</span></div>
                  <div className="oddk-timelineScroll" tabIndex={0} role="region" aria-label="오늘의 시간표. 일정을 누르면 수정할 수 있어요.">
                    <div className="oddk-timeline" style={{ height: (timeline.end - timeline.start) * pixelsPerMinute + 24, minWidth: 62 + timeline.columns * 84 }}>
                      {Array.from({ length: (timeline.end - timeline.start) / 30 + 1 }, (_, index) => {
                        const minute = timeline.start + index * 30;
                        return <div key={minute} className={"oddk-timeTick" + (minute % 60 ? " oddk-halfHour" : "")} style={{ top: (minute - timeline.start) * pixelsPerMinute + 12 }}>
                          <time>{clockLabel(minute)}</time><span />
                        </div>;
                      })}
                      <div className="oddk-timelineEvents">
                        {timeline.items.map((task) => {
                          const work = task.minutes - task.bufferMinutes;
                          const description = `${task.title}, ${task.startTime}부터 ${clockLabel(task.end)}, 작업 ${work}분, 여유 ${task.bufferMinutes}분${task.conflict ? ", 시간 겹침" : ""}`;
                          return <button key={task.id} type="button" className="oddk-timeSlot" data-conflict={task.conflict}
                            style={{ top: (task.start - timeline.start) * pixelsPerMinute + 12, height: task.minutes * pixelsPerMinute, left: `${task.lane / task.columns * 100}%`, width: `calc(${100 / task.columns}% - 5px)` }}
                            aria-label={description + ", 시간 수정"} title={description} onClick={() => openEditor(task)}>
                            <span className="oddk-slotWork" style={{ height: work * pixelsPerMinute }}>
                              <strong>{task.title}</strong><span>{task.startTime} – {clockLabel(task.start + work)}</span>
                              <span>작업 {work}분{task.conflict ? " · 시간 겹침" : ""}</span>
                            </span>
                            <span className="oddk-slotBuffer" style={{ height: task.bufferMinutes * pixelsPerMinute }}>
                              <span>여유 {task.bufferMinutes}분</span>
                            </span>
                          </button>;
                        })}
                      </div>
                    </div>
                  </div>
                </>}
                <p className="oddk-rhythmNote"><GoDotFill aria-hidden="true" />여유도 계획의 일부예요.</p>
              </aside>
              <div hidden={view !== "mandala"}><MandalaView tasks={plan.tasks} draft={mandala} dirty={mandalaDraft !== null} onChange={setMandalaDraft} onSave={(mandala) => { const saved = save({ ...plan, mandala }, "만다라트를 저장했어요."); if (saved) setMandalaDraft(null); return saved; }} onEdit={openEditor} onList={() => changeView("list")} /></div>
              <div hidden={view !== "alpen"}><AlpenView key={JSON.stringify(plan.review) ?? "new-review"} tasks={plan.tasks} review={typeof plan.review === "string" ? plan.review : ""} onReview={(review) => save({ ...plan, review }, "하루 점검을 저장했어요.")} onEdit={openEditor} onList={() => changeView("list")} onRhythm={() => changeView("rhythm")} selectedTaskId={view === "alpen" ? alpenTaskId : null} /></div>
              <div hidden={view !== "stats"}><TimeStatsView tasks={plan.tasks} /></div>
            </div>
          </main>
        </div>
      </div>
      <dialog ref={dialogRef} className="oddk-dialog oddk-taskEditor" aria-labelledby="edit-dialog-title" onClose={() => { setEditingId(null); setEditError(""); }}
        onClick={(event) => { if (event.target === event.currentTarget) setEditingId(null); }}>
        {editingTask && <form onSubmit={updateTask} className="oddk-dialogForm">
          <header className="oddk-dialogHeader"><h2 id="edit-dialog-title">할 일 수정</h2><button type="button" onClick={() => setEditingId(null)} aria-label="수정 창 닫기"><HiOutlineXMark aria-hidden="true" /></button></header>
          <div className="oddk-dialogBody">
          <label className="oddk-dialogField oddk-editorTitle" htmlFor="edit-title">할 일<input ref={editInputRef} id="edit-title" value={editTitle} maxLength={120} required
            onChange={(event) => { setEditTitle(event.target.value); setEditError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} autoFocus /></label>
          <div className="oddk-editorMeta">
            <fieldset className="oddk-editorPriority"><legend>우선순위</legend>
              <div className="oddk-priorityOptions">{(["low", "normal", "high"] as const).map((priority) => (
                <label key={priority}><input type="radio" name="edit-priority" value={priority} className="oddk-srOnly"
                  checked={editPriority === priority} onChange={() => setEditPriority(priority)} /><span>{priorities[priority].label}</span></label>
              ))}</div>
            </fieldset>
            <label className="oddk-dialogField oddk-editorStatus" htmlFor="edit-status">상태
              <span className="oddk-editorSelect"><select id="edit-status" value={editDone ? "done" : "active"} onChange={(event) => setEditDone(event.target.value === "done")}>
                <option value="active">진행 중</option><option value="done">완료</option>
              </select><HiOutlineChevronDown aria-hidden="true" /></span>
            </label>
          </div>
          <details open className="oddk-dialogTimes oddk-editorDisclosure">
            <summary><HiOutlineChevronDown aria-hidden="true" /><span>시간 설정</span><span className="oddk-editorOptional">선택</span>
              {(editWork || editBuffer || editStart) && <button type="button" className="oddk-clearTime" aria-label="시간 설정 지우기" title="시간 설정 지우기"
                onClick={(event) => { event.preventDefault(); setEditWork(""); setEditBuffer(""); setEditStart(""); setEditError(""); }}><HiOutlineArrowUturnLeft aria-hidden="true" /></button>}
            </summary>
            <TaskTimeFields work={editWork} buffer={editBuffer}
              onWorkChange={(value) => { setEditWork(value); setEditError(""); }} onBufferChange={(value) => { setEditBuffer(value); setEditError(""); }} />
            <label className="oddk-dialogField oddk-startField" htmlFor="edit-start">시작 시간
              <input id="edit-start" type="time" step={60} lang="ko" value={editStart} disabled={editTime.minutes === null} aria-describedby="edit-start-guide"
                onChange={(event) => { setEditStart(event.target.value); setEditError(""); }} />
              <small id="edit-start-guide" className="oddk-srOnly">{editTime.minutes === null ? "작업·여유 시간을 먼저 입력해주세요." : editStart ? `종료 ${clockLabel(clockMinutes(editStart) + editTime.minutes)} · 여유 포함` : "설정하면 오늘의 리듬에 배치돼요."}</small>
            </label>
          </details>
          <details className="oddk-dialogLinks oddk-editorDisclosure" open={editLinks.length > 0}>
            <summary><HiOutlineChevronDown aria-hidden="true" /><span>만다라트 연결<small>필요할 때 목표와 연결하세요</small></span></summary>
            <div className="oddk-dialogLinkContent">
            <div className="oddk-linkSelectors">
              <label htmlFor="edit-link-area">세부 목표<select id="edit-link-area" value={linkArea} onChange={(event) => { setLinkArea(event.target.value); setLinkSlot(""); }}>
                <option value="">목표 선택</option>{mandala.areas.map((area, index) => <option key={index} value={index}>{index + 1}. {area.title || `세부 목표 ${index + 1}`}</option>)}
              </select></label>
              <label htmlFor="edit-link-slot">연결할 실행 칸<select id="edit-link-slot" disabled={linkArea === ""} value={linkSlot} onChange={(event) => {
                const slot = event.target.value;
                if (!slot) return;
                const key = `${linkArea}:${slot}`;
                setEditLinks((current) => current.includes(key) ? current : [...current, key]);
                setLinkSlot(""); setEditError("");
              }}><option value="">{linkArea === "" ? "목표를 먼저 선택" : "빈 칸 선택"}</option>
                {linkArea !== "" && mandala.areas[Number(linkArea)].taskIds.map((id, index) => {
                  const linkedTask = plan.tasks.find((item) => item.id === id && item.id !== editingTask.id);
                  const selected = editLinks.includes(`${linkArea}:${index}`);
                  return <option key={index} value={index} disabled={Boolean(linkedTask) || selected}>실행 {index + 1}{selected ? " · 연결됨" : linkedTask ? ` · ${linkedTask.title}` : " · 빈 칸"}</option>;
                })}
              </select></label>
            </div>
            <div className="oddk-linkedGoals">{editLinks.length ? editLinks.map((link) => {
              const [a, c] = link.split(":").map(Number);
              const label = `${mandala.areas[a].title || `세부 목표 ${a + 1}`} · 실행 ${c + 1}`;
              return <span key={link}>{label}<button type="button" aria-label={label + " 연결 해제"} onClick={() => setEditLinks((current) => current.filter((item) => item !== link))}><HiOutlineXMark aria-hidden="true" /></button></span>;
            }) : <small>연결된 목표가 없어요.</small>}</div>
            <p>연결·해제는 저장할 때 반영돼요.{mandalaDraft && " 목표 변경사항도 함께 저장돼요."}</p>
            </div>
          </details>
          {editError && <p role="alert" className="oddk-dialogError">{editError}</p>}
          </div>
          <div className="oddk-dialogActions">
            <button type="button" className="oddk-dialogDelete" onClick={() => deleteTask(editingTask)}>삭제</button>
            <button type="button" className="oddk-dialogCancel" onClick={() => setEditingId(null)}>취소</button>
            <button type="submit" className="oddk-primary">저장</button>
          </div>
        </form>}
      </dialog>
      <div className={notice ? "oddk-toast" : "oddk-srOnly"} role="status" aria-live="polite" aria-atomic="true">
        {notice && <><span>{notice.message}</span><button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><HiOutlineXMark aria-hidden="true" /></button></>}
      </div>
    </div>
  );
}
