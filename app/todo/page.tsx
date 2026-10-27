"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, SetStateAction } from "react";
import { HiOutlinePlus, HiOutlineXMark, HiOutlineCheck, HiOutlineMinus, HiOutlineTrash, HiOutlineArrowUturnLeft, HiOutlineClipboardDocumentCheck, HiOutlineSun, HiOutlineListBullet, HiOutlineSquares2X2, HiOutlineChartBar, HiOutlineClock, HiOutlineChevronDown, HiOutlineArrowRight, HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";
import { GoDotFill } from "react-icons/go";
import "./todo.css";
import "./task-editor.css";
import { TaskTimeFields } from "./task-time-fields";
import { parseTaskTimeDraft, workFromStoredTime } from "./task-time";
import { layoutTimeline, clockMinutes, clockLabel } from "./timeline";
import { selectDay } from "./day-selectors";
import { DailyReview } from "./daily-review";
import { keepFocusInDialog } from "./dialog-focus";
import { rescheduleTask, saveDatedReview, moveLegacyReview } from "./planning-actions";
import { MandalaView, AlpenView, TimeStatsView, safeMandala } from "./planning-views";
import type { Mandala, Plan, Task, Priority } from "../../supabase/functions/_shared/plan";
import { hasTaskTime, isClock, isPlanDate, validPlan } from "../../supabase/functions/_shared/plan";
import { koreanToday } from "./plan-date";
import { dayLabel, weekDates, shiftDate, selectRangeTasks } from "./calendar-range";
import type { RangeScope } from "./calendar-range";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration";
import { AutoTextarea } from "./auto-textarea";
import { sameValue } from "./json-equality";
import { makeUndo, applyUndo, validUndo } from "./plan-history";
import type { PlanUndo } from "./plan-history";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { emptyWorkspace, validWorkspace, withoutEditor } from "./workspace-draft";
import type { WorkspaceDraft, EditorDraft, DraftView } from "./workspace-draft";
import initialPlan from "./initial-plan.json";
import { SyncPanel } from "./sync-panel";
import { getPlanSnapshot, getPlanScope, subscribePlan, writePlan, exportPlanBackup, restoreLastValidPlan, backupReviewPlan } from "./sync-store";

type View = DraftView;
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

function subscribeToday(notify: () => void) {
  const timer = window.setInterval(notify, 60000);
  document.addEventListener("visibilitychange", notify);
  return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", notify); };
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
  const scope = useSyncExternalStore(subscribePlan, getPlanScope, () => "local");
  return <TodoWorkspace key={scope} />;
}

function TodoWorkspace() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
  const planLoad = useMemo(() => loadPlan(snapshot), [snapshot]);
  const plan = planLoad.ok ? planLoad.plan : EMPTY_PLAN;
  const today = useSyncExternalStore(subscribeToday, koreanToday, () => "");
  const workspace = useLocalDraft("workspace", emptyWorkspace, validWorkspace);
  function field<K extends keyof WorkspaceDraft>(key: K): [WorkspaceDraft[K], (value: SetStateAction<WorkspaceDraft[K]>) => void] {
    return [workspace.value[key], value => workspace.set(current => ({ ...current, [key]: typeof value === "function" ? (value as (v: WorkspaceDraft[K]) => WorkspaceDraft[K])(current[key]) : value }))];
  }
  const [selectedDate, setSelectedDate] = field("selectedDate");
  const planDate = selectedDate ?? today;
  const savedTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => "light");
  const [themeOverride, setThemeOverride] = useState<"light" | "dark" | null>(null);
  const theme = themeOverride ?? savedTheme;
  const [input, setInput] = field("input");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = field("view");
  const [rangeDraft, setRange] = field("range");
  const range: RangeScope = rangeDraft ?? "day";
  const planningView = view !== "mandala";
  const week = weekDates(planDate);
  const headerTitle = !planningView ? viewHeaders.mandala.title : range === "all" ? "생각나는 할 일을 모두 적어주세요." : range === "week" ? `${week[0] ?? "—"} ~ ${week.at(-1) ?? "—"}` : dayLabel(planDate);
  const [selectionMode, setSelectionMode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const [editingId, setEditingId] = field("editingId");
  const [replanId, setReplanId] = useState<string | null>(null);
  const [replanDate, setReplanDate] = useState("");
  const [replanError, setReplanError] = useState("");
  const editor = editingId && Object.hasOwn(workspace.value.editors, editingId) ? workspace.value.editors[editingId] : undefined;
  function editField<K extends keyof EditorDraft>(key: K, fallback: EditorDraft[K]): [EditorDraft[K], (value: SetStateAction<EditorDraft[K]>) => void] {
    return [editor?.[key] ?? fallback, value => workspace.set(current => {
      const id = current.editingId, previous = id && Object.hasOwn(current.editors, id) ? current.editors[id] : undefined;
      if (!id || !previous) return current;
      return { ...current, editors: { ...current.editors, [id]: { ...previous, [key]: typeof value === "function" ? (value as (v: EditorDraft[K]) => EditorDraft[K])(previous[key]) : value } } };
    })];
  }
  const [editTitle, setEditTitle] = editField("title", "");
  const [editNotes, setEditNotes] = editField("notes", "");
  const [editWork, setEditWork] = editField("work", "");
  const [editBuffer, setEditBuffer] = editField("buffer", "");
  const [editStart, setEditStart] = editField("start", "");
  const [editDate, setEditDate] = editField("date", "");
  const [editPriority, setEditPriority] = editField("priority", "normal");
  const [editDone, setEditDone] = editField("done", false);
  const [editError, setEditError] = useState("");
  const mandalaDraft = workspace.value.mandalaDraft;
  function setMandalaDraft(value: Mandala | null) { workspace.set(current => ({ ...current, mandalaDraft: value, mandalaBase: value ? current.mandalaBase ?? safeMandala(plan.mandala) : null })); }
  const mandala = mandalaDraft ?? safeMandala(plan.mandala);
  const [editLinks, setEditLinks] = editField("links", []);
  const [linkArea, setLinkArea] = useState("");
  const [linkSlot, setLinkSlot] = useState("");
  const [alpenTaskId, setAlpenTaskId] = useState<string | null>(null);
  const submitDestination = useRef<"alpen" | null>(null);
  const history = useLocalDraft<PlanUndo | null>("undo", null, validUndo);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const replanDialogRef = useRef<HTMLDialogElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editingTask = plan.tasks.find((task) => task.id === editingId);
  const replanTask = plan.tasks.find((task) => task.id === replanId);
  const replanTaskId = replanTask?.id;
  const editingTaskId = editingTask?.id;
  const editTime = parseTaskTimeDraft(editWork, editBuffer);

  useEffect(() => {
    const dialog = replanDialogRef.current;
    if (!dialog) return;
    if (replanTaskId && !dialog.open) dialog.showModal();
    if (!replanTaskId && dialog.open) dialog.close();
  }, [replanTaskId]);

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

  const scopedTasks = selectRangeTasks(plan.tasks, planDate, range);
  const active = scopedTasks.filter((task) => !task.done);
  const doneCount = scopedTasks.length - active.length;
  const day = selectDay(plan.tasks, planDate);
  const noKnownTimes = day.active.length > 0 && day.timedActive.length === 0;
  const progress = scopedTasks.length ? Math.round(doneCount / scopedTasks.length * 100) : 0;
  const rhythmTasks = day.scheduled;
  const timeline = layoutTimeline(rhythmTasks);
  const pixelsPerMinute = 3;
  const visibleTasks = scopedTasks
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

  function save(next: Plan, message: string, recordHistory = true) {
    if (!planLoad.ok) { setError(planLoad.error); return false; }
    if (!validPlan(next)) { setError("할 일과 시간 설정을 확인해주세요."); return false; }
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("저장된 계획이 바뀌었어요. 최신 내용을 확인해주세요.");
      const undo = recordHistory ? makeUndo(plan, next, message) : null;
      writePlan(next);
      if (recordHistory && undo) history.set(undo);
      setError("");
      setNotice({ message });
      return true;
    } catch (error) {
      setError(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "브라우저에 저장하지 못했어요. 저장 공간이나 사이트 저장 권한을 확인해주세요.");
      return false;
    }
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = input.trim();
    if (range !== "all" && !isPlanDate(planDate)) { setError("등록할 날짜를 먼저 선택해주세요."); return; }
    if (!title) { setError("할 일을 먼저 입력해주세요."); inputRef.current?.focus(); return; }
    if (plan.tasks.some((task) => !task.done && task.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      setError("이미 남아 있는 할 일이에요. 기존 목록을 확인해주세요."); return;
    }
    const task: Task = { id: crypto.randomUUID(), title, minutes: null, bufferMinutes: null, startTime: null, priority: "normal", done: false, plannedDate: range === "all" ? null : planDate, notes: "" };
    if (save({ ...plan, tasks: [...plan.tasks, task] }, "할 일을 추가했어요.")) {
      setInput(""); setFilter("all"); setSelectedIds(new Set()); setSelectionMode(false); inputRef.current?.focus();
    }
  }

  function readLatestPlan() {
    const loaded = loadPlan(getPlanSnapshot(EMPTY_SNAPSHOT));
    if (!loaded.ok) throw new Error(loaded.error);
    return loaded.plan;
  }

  function submitReplan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const next = rescheduleTask(readLatestPlan(), replanId ?? "", replanDate, koreanToday());
      if (save(next, `${replanDate}로 다시 계획했어요. 시작 시간은 새로 정해주세요.`)) { setReplanId(null); setReplanError(""); }
      else setReplanError("저장하지 못했어요. 선택한 날짜는 유지돼요. 다시 시도해주세요.");
    } catch (error) { setReplanError((error as Error).message); }
  }

  function submitReview(date: string, text: string, expected: string, overwrite: boolean) {
    try {
      const current = readLatestPlan();
      const next = saveDatedReview(current, date, text, expected);
      if (overwrite) backupReviewPlan(current);
      return save(next, `${date} 하루 점검을 저장했어요.`);
    } catch (error) { setError((error as Error).message); return false; }
  }

  function transferLegacyReview(date: string, expected: string) {
    try {
      const current = readLatestPlan();
      const next = moveLegacyReview(current, date, expected);
      backupReviewPlan(current);
      return save(next, `${date}로 이전 점검을 옮겼어요.`);
    } catch (error) { setError((error as Error).message); return false; }
  }

  function keepReviewDraft(date: string, text: string) {
    try {
      const current = readLatestPlan();
      backupReviewPlan(saveDatedReview(current, date, text, current.reviewsByDate[date] ?? ""));
      return true;
    } catch (error) { setError((error as Error).message); return false; }
  }

  function withoutTasks(ids: Set<string>): Plan {
    const mandala = plan.mandala ? { ...plan.mandala, areas: plan.mandala.areas.map(area => ({ ...area, taskIds: area.taskIds.map(id => ids.has(id) ? "" : id) })) } : undefined;
    return { ...plan, mandala, tasks: plan.tasks.filter(t => !ids.has(t.id)) };
  }
  function deleteTask(task: Task) {
    if (save(withoutTasks(new Set([task.id])), "할 일을 삭제했어요.")) {
      setSelectedIds(current => new Set([...current].filter(id => id !== task.id)));
      workspace.set(current => withoutEditor(current, task.id));
    }
  }
  function undoLatest() {
    if (!history.value) return;
    try {
      const next = applyUndo(readLatestPlan(), history.value);
      if (save(next, "직전 변경을 되돌렸어요.", false)) { history.set(null); setSelectedIds(new Set()); }
    } catch (error) { setError((error as Error).message); }
  }
  function deleteSelected() {
    const ids = new Set(selectedTasks.map(t => t.id)); if (!ids.size) return;
    if (save(withoutTasks(ids), ids.size + "개의 할 일을 삭제했어요.")) {
      workspace.set(current => [...ids].reduce((result, id) => withoutEditor(result, id), current));
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
    if (["alpen", "stats", "rhythm"].includes(value)) setRange("day");
    setView(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function navigateRange(value: RangeScope) {
    workspace.set(current => ({ ...current, range: value, view: "list", selectedDate: value === "all" ? current.selectedDate : koreanToday() }));
    setFilter("all"); setSelectedIds(new Set()); setSelectionMode(false); setError("");
  }

  function editorFrom(task: Task): EditorDraft {
    return { base: task, baseMandala: safeMandala(plan.mandala), title: task.title, notes: task.notes ?? "", work: workFromStoredTime(task.minutes, task.bufferMinutes), buffer: task.bufferMinutes === null ? "" : String(task.bufferMinutes), start: task.startTime ?? "", date: task.plannedDate ?? "", priority: task.priority, done: task.done, links: mandala.areas.flatMap((area, a) => area.taskIds.flatMap((id, c) => id === task.id ? [a + ":" + c] : [])) };
  }
  function openEditor(task: Task) {
    workspace.set(current => ({ ...current, editingId: task.id, editors: { ...current.editors, [task.id]: Object.hasOwn(current.editors, task.id) ? current.editors[task.id] : editorFrom(task) } }));
    setLinkArea(""); setLinkSlot(""); setEditError("");
  }
  function discardEditor() { if (editingId) workspace.set(current => withoutEditor(current, editingId)); setEditError(""); }
  const editorConflict = Boolean(editor && editingTask && (!sameValue(editor.base, editingTask) || !sameValue(editor.baseMandala, safeMandala(plan.mandala))));
  const goalConflict = Boolean(mandalaDraft && workspace.value.mandalaBase && !sameValue(workspace.value.mandalaBase, safeMandala(plan.mandala)));

  function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) { setEditingId(null); return; }
    try { if (!sameValue(readLatestPlan(), plan)) { setEditError("저장된 계획이 갱신됐어요. 다시 확인한 뒤 저장해주세요."); return; } } catch (error) { setEditError((error as Error).message); return; }
    if (editorConflict) { setEditError("저장된 업무나 목표가 바뀌었어요. 아래에서 사용할 내용을 선택해주세요."); return; }
    const task = editingTask;
    const title = editTitle.trim();
    const { minutes: duration, bufferMinutes: buffer, error: timeError } = editTime;
    if (!title) { setEditError("수정할 내용을 입력해주세요."); return; }
    if (timeError) { setEditError(timeError); return; }
    if (editDate && !isPlanDate(editDate)) { setEditError("계획 날짜를 올바르게 선택해주세요."); return; }
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
    const destination = submitDestination.current;
    if (save({ ...plan, mandala: nextMandala, tasks: plan.tasks.map((item) => item.id === task.id ? { ...item, title, notes: editNotes ?? "", minutes: duration, bufferMinutes: buffer, startTime: editStart || null, plannedDate: editDate || null, priority: editPriority, done: editDone } : item) }, "내용을 수정했어요.")) {
      if (linksChanged) setMandalaDraft(null);
      workspace.set(current => withoutEditor(current, task.id)); setSelectedIds(new Set());
      if (destination === "alpen") { setAlpenTaskId(task.id); if (editDate) setSelectedDate(editDate); changeView("alpen"); }
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
            <nav className="oddk-navigation" aria-label="계획 탐색">
              <button type="button" aria-current={planningView && range === "day" ? "page" : undefined} onClick={() => navigateRange("day")}><HiOutlineSun aria-hidden="true" /><span>오늘 계획</span></button>
              <button type="button" aria-current={planningView && range === "week" ? "page" : undefined} onClick={() => navigateRange("week")}><HiOutlineClipboardDocumentCheck aria-hidden="true" /><span>이번 주</span></button>
              <button type="button" aria-current={planningView && range === "all" ? "page" : undefined} onClick={() => navigateRange("all")}><HiOutlineListBullet aria-hidden="true" /><span>전체 할 일</span></button>
              <button type="button" aria-current={!planningView ? "page" : undefined} onClick={() => changeView("mandala")}><HiOutlineSquares2X2 aria-hidden="true" /><span>목표</span></button>
            </nav>
            <SyncPanel fallback={EMPTY_SNAPSHOT} />
          </aside>

          <main className="oddk-workspace">
            <button type="button" className="oddk-themeToggle" onClick={toggleTheme} aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}><HiOutlineSun aria-hidden="true" /></button>
            <header className="oddk-intro">
              <h1>{headerTitle}</h1>
              <p>{!planningView ? viewHeaders.mandala.description : range === "all" ? "날짜 없이 먼저 모으고, 할 일을 눌러 계획할 날짜를 정해요." : range === "week" ? "이번 주의 할 일을 살펴보고, 날짜를 눌러 하루를 계획해요." : "오늘 할 만큼 고르고, 작업과 여유를 시간표에 배치해요."}</p>
              {planningView && range !== "all" && <>
                <div className="oddk-dateToolbar"><label htmlFor="plan-date">계획 날짜<input id="plan-date" type="date" min="0001-01-01" max="9999-12-31" value={planDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><button type="button" disabled={!today} onClick={() => { setSelectedDate(koreanToday()); }}>오늘로</button><span>한국 시간 · 월요일부터 한 주</span></div>
                <div className="oddk-weekNav"><button type="button" disabled={!shiftDate(planDate, -7)} onClick={() => setSelectedDate(shiftDate(planDate, -7)!)} aria-label="이전 주"><HiOutlineChevronLeft aria-hidden="true" /></button><div className="oddk-weekDays" role="group" aria-label="날짜 선택">{week.map(date => <button type="button" key={date} aria-pressed={date === planDate} aria-label={dayLabel(date)} onClick={() => { setSelectedDate(date); setRange("day"); setView("list"); }}><span>{dayLabel(date).slice(-2, -1)}</span><strong>{Number(date.slice(-2))}</strong>{date === today && <small>오늘</small>}</button>)}</div><button type="button" disabled={!shiftDate(planDate, 7)} onClick={() => setSelectedDate(shiftDate(planDate, 7)!)} aria-label="다음 주"><HiOutlineChevronRight aria-hidden="true" /></button></div>
              </>}
              {planningView && range !== "all" && plan.tasks.some(task => task.plannedDate === null && !task.done) && <button type="button" className="oddk-undatedLink" onClick={() => navigateRange("all")}>날짜 없는 할 일 {plan.tasks.filter(task => task.plannedDate === null && !task.done).length}개 보기<HiOutlineArrowRight aria-hidden="true" /></button>}
            </header>
            {history.value && <div className="oddk-undoBar"><small>{history.value.label}</small><button type="button" onClick={undoLatest} title="이 기기의 최근 변경1건을 되돌려요. 다음 저장 시 교체되며 이후 바뀐 내용은 덮지 않아요."><HiOutlineArrowUturnLeft aria-hidden="true" />최근 변경 되돌리기</button></div>}
            {history.problem && <DraftFeedback draft={history} />}
            {view !== "list" && <DraftFeedback draft={workspace} />}
      {Object.entries(workspace.value.editors).filter(([id]) => !plan.tasks.some(t => t.id === id)).map(([id, draft]) => <section className="oddk-draftRecovery" key={id}><strong>삭제된 할 일의 초안</strong><p>{draft.title}</p><button type="button" onClick={() => { setInput(draft.title); changeView("list"); }}>추가 입력란으로 복사</button><button type="button" onClick={() => workspace.set(current => withoutEditor(current, id))}>이 초안 폐기</button><button type="button" onClick={workspace.download}>초안 백업 받기</button></section>)}

            {planningView && range === "day" && <div className="oddk-paneSwitch" role="group" aria-label="하루 보기"><button type="button" aria-pressed={view !== "rhythm"} onClick={() => changeView("list")}><HiOutlineListBullet />목록</button><button type="button" aria-pressed={view === "rhythm"} onClick={() => changeView("rhythm")}><HiOutlineClock />시간표</button></div>}
            <div className={"oddk-contentGrid oddk-singleView" + (planningView && range === "day" ? " oddk-dailyGrid" : "")} data-pane={view === "rhythm" ? "rhythm" : "list"}>
              <section hidden={!planningView} className="oddk-taskArea" aria-labelledby="task-list-title">
                <div className="oddk-sectionHeading">
                  <h2 id="task-list-title" className="oddk-srOnly">할 일 리스트</h2>
                  <div className="oddk-listTabs" role="group" aria-label="할 일 상태">
                    <button type="button" aria-pressed={filter === "all"} onClick={() => changeFilter("all")}>나의 할 일<span>{scopedTasks.length}</span></button>
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
                        {task.plannedDate && <time dateTime={task.plannedDate} className="oddk-taskDate">{task.plannedDate}</time>}
                      </span>
                    </button>
                    {!selectionMode && !task.done && today && task.plannedDate && task.plannedDate < today && <button type="button" className="oddk-replanButton" aria-label={task.title + " 다시 계획"} onClick={() => { setReplanDate(koreanToday()); setReplanError(""); setReplanId(task.id); }}><HiOutlineArrowUturnLeft aria-hidden="true" />다시 계획</button>}
                    {task.done && <span className="oddk-doneBadge">완료</span>}
                  </li>)}
                </ul>}

                <p className="oddk-addTarget">{range === "all" ? "날짜 없이 추가" : isPlanDate(planDate) ? `${dayLabel(planDate)}에 추가` : "계획 날짜를 선택해주세요"}</p>
                <form onSubmit={addTask} className="oddk-addForm">
                  <button type="submit" aria-label="할 일 추가" disabled={!today}><HiOutlinePlus aria-hidden="true" /></button>
                  <AutoTextarea ref={inputRef} id="todo-input" aria-label="할 일 입력" disabled={!today} value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} aria-describedby="todo-input-count" onLimit={() => setError("할 일 제목은120자까지 입력할 수 있어요. 긴 내용은 상세 메모에 적어주세요. 기존 입력은 유지했어요.")}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} title="Enter로 추가, Shift+Enter로 줄바꿈"
                    maxLength={120} placeholder={today ? "떠오르는 할 일을 적어보세요" : "저장된 할 일을 불러오고 있어요"} autoComplete="off" />
                </form>

                <small id="todo-input-count" className="oddk-inputCount">{input.length}/120</small>
                <DraftFeedback draft={workspace} />
                <div className="oddk-dayProgress">
                  <div><span>이 범위 {scopedTasks.length}개 중 {doneCount}개 완료</span><strong>{progress}%</strong></div>
                  <progress aria-label="현재 범위의 할 일 완료율" max={100} value={progress} />
                </div>
              </section>

              <aside hidden={!planningView || range !== "day"} className="oddk-rhythm" aria-labelledby="rhythm-title">
                <h2 id="rhythm-title">시간표</h2>
                <div className="oddk-timeSummary" aria-label="선택 날짜의 미완료 업무 계획 시간">
                  <div><span>수행</span><strong>{noKnownTimes ? "—" : day.activeTotal}<small>분</small></strong></div>
                  <div><span>작업</span><strong>{noKnownTimes ? "—" : day.activeWork}<small>분</small></strong></div>
                  <div><span>여유</span><strong>{noKnownTimes ? "—" : day.activeBuffer}<small>분</small></strong></div>
                </div>
                {rhythmTasks.length === 0 ? <div className="oddk-rhythmEmpty"><HiOutlineClock aria-hidden="true" /><p>{day.tasks.length > 0 && day.active.length === 0 ? "선택한 날짜의 할 일을 모두 마쳤어요." : day.active.length > 0 ? "할 일에 작업·여유 시간과 시작 시간을 정해주세요." : "목록에서 계획 날짜와 시작 시간을 정해주세요."}</p></div> : <>
                  <div className="oddk-timelineLegend" aria-label="시간표 구분"><span><i />작업</span><span><i />여유</span></div>
                  <div className="oddk-timelineScroll" tabIndex={0} role="region" aria-label={`${planDate} 시간표. 일정을 누르면 수정할 수 있어요.`}>
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
              <div hidden={view !== "mandala"}>{goalConflict && <section className="oddk-draftConflict" role="alert"><strong>저장된 목표가 바뀌었어요.</strong><button type="button" onClick={() => { workspace.download(); setMandalaDraft(null); }}>초안 백업 후 저장본 사용</button><button type="button" onClick={() => { workspace.download(); workspace.set(current => ({ ...current, mandalaBase: safeMandala(plan.mandala) })); }}>백업 후 내 초안으로 계속 편집</button></section>}{mandalaDraft && <button type="button" onClick={() => setMandalaDraft(null)}>목표 초안 폐기</button>}<MandalaView tasks={plan.tasks} draft={mandala} dirty={mandalaDraft !== null} onChange={setMandalaDraft} onSave={(mandala) => { if (goalConflict) { setError("저장된 목표가 바뀌었어요. 초안을 백업한 뒤 사용할 내용을 선택해주세요."); return false; } const saved = save({ ...plan, mandala }, "만다라트를 저장했어요."); if (saved) setMandalaDraft(null); return saved; }} onEdit={openEditor} onList={() => changeView("list")} /></div>
            </div>
            {planningView && range === "day" && <div className="oddk-dayDetails"><details open={view === "alpen"}><summary><HiOutlineClipboardDocumentCheck aria-hidden="true" />하루 계획과 점검</summary><AlpenView day={day} onEdit={openEditor} onList={() => changeView("list")} onRhythm={() => changeView("rhythm")} selectedTaskId={view === "alpen" ? alpenTaskId : null} /><DailyReview date={planDate} reviews={plan.reviewsByDate} legacy={typeof plan.review === "string" ? plan.review : ""} onSave={submitReview} onMoveLegacy={transferLegacyReview} onUseSaved={keepReviewDraft} onBackup={() => exportPlanBackup(EMPTY_SNAPSHOT, true)} /></details><details open={view === "stats"}><summary><HiOutlineChartBar aria-hidden="true" />시간 분석</summary><TimeStatsView day={day} /></details></div>}
          </main>
        </div>
      </div>
      <dialog ref={dialogRef} className="oddk-dialog oddk-taskEditor" aria-labelledby="edit-dialog-title" onKeyDown={keepFocusInDialog} onClose={() => { setEditingId(null); setEditError(""); }}
        onClick={(event) => { if (event.target === event.currentTarget) setEditingId(null); }}>
        {editingTask && <form onSubmit={updateTask} className="oddk-dialogForm">
          <header className="oddk-dialogHeader"><h2 id="edit-dialog-title">할 일 수정</h2><button type="button" onClick={() => setEditingId(null)} aria-label="수정 창 닫기"><HiOutlineXMark aria-hidden="true" /></button></header>
          <div className="oddk-dialogBody">
          <label className="oddk-dialogField oddk-editorTitle" htmlFor="edit-title">할 일<AutoTextarea ref={editInputRef} id="edit-title" aria-label="할 일" value={editTitle} maxLength={120} required aria-describedby="edit-title-count" onLimit={() => setEditError("제목은120자까지 입력할 수 있어요. 기존 입력은 유지했어요.")}
            onChange={(event) => { setEditTitle(event.target.value); setEditError(""); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} autoFocus /><small id="edit-title-count">{editTitle.length}/120</small></label>
          <label className="oddk-dialogField oddk-editorNotes" htmlFor="edit-notes">상세 메모<AutoTextarea id="edit-notes" aria-label="상세 메모" aria-describedby="edit-notes-count" onLimit={() => setEditError("상세 메모는2000자까지 입력할 수 있어요. 기존 메모는 유지했어요.")} value={editNotes ?? ""} maxLength={2000} placeholder="단계, 준비물, 참고할 내용을 자유롭게 적어보세요." onChange={event => { setEditNotes(event.target.value); setEditError(""); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><small id="edit-notes-count">{(editNotes ?? "").length}/2000</small></label>
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
          <div className="oddk-editorDate"><label className="oddk-dialogField" htmlFor="edit-date">계획 날짜<input id="edit-date" type="date" min="0001-01-01" max="9999-12-31" value={editDate} onChange={(event) => { setEditDate(event.target.value); setEditError(""); }} aria-describedby="edit-date-guide" /></label><div><button type="button" disabled={!today} onClick={() => setEditDate(koreanToday())}>오늘로 지정</button><button type="button" disabled={!editDate} onClick={() => setEditDate("")}>날짜 해제</button></div><small id="edit-date-guide">{editDate ? "이 날짜의 시간표·계획·통계에 포함돼요." : "날짜를 정하기 전에는 목록에만 보관해요. 시간 설정은 유지돼요."}</small></div>
          <details open className="oddk-dialogTimes oddk-editorDisclosure">
            <summary><HiOutlineChevronDown aria-hidden="true" /><span>시간 설정</span><span className="oddk-editorOptional">선택</span>
              {(editWork || editBuffer || editStart) && <button type="button" className="oddk-clearTime" aria-label="시간 설정 지우기" title="시간 설정 지우기"
                onClick={(event) => { event.preventDefault(); setEditWork(""); setEditBuffer(""); setEditStart(""); setEditError(""); }}><HiOutlineArrowUturnLeft aria-hidden="true" /></button>}
            </summary>
            <TaskTimeFields work={editWork} buffer={editBuffer}
              onWorkChange={(value) => { setEditWork(value); if (!value.trim()) setEditStart(""); setEditError(""); }} onBufferChange={(value) => { setEditBuffer(value); setEditError(""); }} />
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
          <button type="button" className="oddk-openAlpen" disabled={!editDate} aria-describedby={!editDate ? "edit-date-guide" : undefined} onClick={(event) => { submitDestination.current = "alpen"; try { event.currentTarget.form?.requestSubmit(); } finally { submitDestination.current = null; } }}><HiOutlineArrowRight aria-hidden="true" />저장 후 하루 계획 보기</button>
          </div>
          <DraftFeedback draft={workspace} />
          {editorConflict && <section className="oddk-draftConflict" role="alert"><strong>저장된 업무나 목표가 바뀌었어요. 초안은 그대로 있어요.</strong><p>저장본: {editingTask?.title} / 내 초안: {editTitle}</p><p>저장된 메모: {editingTask?.notes || "없음"}<br />내 메모: {editNotes || "없음"}</p><button type="button" onClick={() => { workspace.download(); if (editingTask) workspace.set(current => ({ ...current, editors: { ...current.editors, [editingTask.id]: editorFrom(editingTask) } })); }}>초안 백업 후 저장본 사용</button><button type="button" onClick={() => { workspace.download(); if (editingTask && editingId) workspace.set(current => ({ ...current, editors: { ...current.editors, [editingId]: { ...current.editors[editingId], base: editingTask, baseMandala: safeMandala(plan.mandala) } } })); }}>백업 후 내 초안으로 계속 편집</button></section>}
          {editError && <p role="alert" className="oddk-dialogError">{editError}</p>}
          <div className="oddk-dialogActions">
            <button type="button" className="oddk-dialogDelete" onClick={() => deleteTask(editingTask)}>삭제</button>
            <button type="button" className="oddk-dialogCancel" onClick={discardEditor}>취소</button>
            <button type="submit" className="oddk-primary">저장</button>
          </div>
        </form>}
      </dialog>
      <dialog ref={replanDialogRef} className="oddk-dialog oddk-replanDialog" aria-labelledby="replan-title" onKeyDown={keepFocusInDialog} onClose={() => { setReplanId(null); setReplanError(""); }} onClick={(event) => { if (event.target === event.currentTarget) setReplanId(null); }}>
        {replanTask && <form className="oddk-dialogForm" onSubmit={submitReplan}><header className="oddk-dialogHeader"><h2 id="replan-title">다시 계획하기</h2><button type="button" aria-label="다시 계획 창 닫기" onClick={() => setReplanId(null)}><HiOutlineXMark /></button></header><strong>{replanTask.title}</strong><p>기존 날짜 {replanTask.plannedDate}</p><label className="oddk-dialogField" htmlFor="replan-date">새 계획 날짜<input id="replan-date" type="date" min="0001-01-01" max="9999-12-31" required value={replanDate} onChange={(event) => { setReplanDate(event.target.value); setReplanError(""); }} /></label><p>시작 시간은 비우고, 할 일의 내용·시간·목표 연결은 그대로 유지해요.</p>{replanError && <p role="alert" className="oddk-dialogError">{replanError}</p>}<div className="oddk-dialogActions"><button type="button" onClick={() => setReplanId(null)}>취소</button><button type="submit" className="oddk-primary">날짜 옮기기</button></div></form>}
      </dialog>
      <div className={notice ? "oddk-toast" : "oddk-srOnly"} role="status" aria-live="polite" aria-atomic="true">
        {notice && <><span>{notice.message}</span>{history.value && <button type="button" onClick={undoLatest}>실행 취소</button>}<button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><HiOutlineXMark aria-hidden="true" /></button></>}
      </div>
    </div>
  );
}
