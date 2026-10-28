"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, SetStateAction } from "react";
import { HiOutlinePlus, HiOutlineXMark, HiOutlineCheck, HiOutlineMinus, HiOutlineTrash, HiOutlineArrowUturnLeft, HiOutlineClipboardDocumentCheck, HiOutlineSun, HiOutlineListBullet, HiOutlineSquares2X2, HiOutlineChartBar, HiOutlineClock, HiOutlineChevronDown, HiOutlineArrowRight, HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";
import { GoDotFill } from "react-icons/go";
import "./todo.css";
import "./task-editor.css";
import "./classification.css";
import "./task-planning.css";
import { TaskPlanningBadges, TaskPlanningFields, TaskMoveButtons, BulkActionDialog } from "./task-planning-controls";
import { sortTasks, moveVisibleTask, selectedTaskSummary } from "./task-order";
import type { TaskSort } from "./task-order";
import { previewBulkAction, applyBulkAction } from "./bulk-actions";
import type { BulkRequest } from "./bulk-actions";
import { validTaskPlanning } from "../../supabase/functions/_shared/task-planning";
import { deletePlanTasks, setTaskGoalLinks, saveGoalTree, splitTask } from "./goal-actions";
import { GoalTreeView } from "./goal-tree-view";
import { taskGoalIds, editorGoalIds, editorGoalConflict, legacyEditorLinksChanged, convertLegacyEditorLinks, mergeLegacyGoalDraft } from "./goal-editor";
import { TaskScheduleFields } from "./task-schedule-fields";
import { parseEditorSchedule, retargetEditorDate } from "./editor-schedule";
import { workFromStoredTime } from "./task-time";
import { layoutTimeline, clockLabel } from "./timeline";
import { selectDay } from "./day-selectors";
import { DailyReview } from "./daily-review";
import { DayAvailability } from "./day-availability";
import { availabilitySummary } from "./availability";
import { defaultAvailability } from "../../supabase/functions/_shared/schedule";
import { taskDaySlice } from "./task-period";
import { keepFocusInDialog } from "./dialog-focus";
import { rescheduleTask, saveDatedReview, moveLegacyReview } from "./planning-actions";
import { MandalaView, AlpenView, TimeStatsView, safeMandala } from "./planning-views";
import type { Mandala, Plan, Task, Priority } from "../../supabase/functions/_shared/plan";
import { hasTaskTime, isPlanDate, validPlan } from "../../supabase/functions/_shared/plan";
import { koreanToday, koreanClock } from "./plan-date";
import { dayLabel, weekDates, shiftDate, selectRangeTasks } from "./calendar-range";
import type { RangeScope } from "./calendar-range";
import { loadPlan, taskToV4 } from "../../supabase/functions/_shared/plan-migration";
import { AutoTextarea } from "./auto-textarea";
import { ClassificationBadges, ClassificationFilters, ClassificationManager, TaskClassificationFields, defaultClassification } from "./classification-controls";
import { filterClassifiedTasks } from "./classification-actions";
import type { ClassificationFilter } from "./classification-actions";
import { validTaxonomyReferences } from "../../supabase/functions/_shared/taxonomy";
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
const EMPTY_PLAN: Plan = (() => { const loaded = loadPlan(JSON.stringify(initialPlan)); if (!loaded.ok) throw new Error("기본 계획을 읽지 못했어요. 원문을 확인해주세요."); return loaded.plan; })();
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
  const nowTime = useSyncExternalStore(subscribeToday, koreanClock, () => "");
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
  const classification = workspace.value.classification ?? defaultClassification;
  function changeClassification(value: ClassificationFilter) {
    workspace.set(current => ({ ...current, classification: value }));
    setError("");
  }
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = field("view");
  const [rangeDraft, setRange] = field("range");
  const range: RangeScope = rangeDraft ?? "day";
  const planningView = view !== "mandala";
  const week = weekDates(planDate);
  const headerTitle = !planningView ? viewHeaders.mandala.title : range === "all" ? "생각나는 할 일을 모두 적어주세요." : range === "week" ? `${week[0] ?? "—"} ~ ${week.at(-1) ?? "—"}` : dayLabel(planDate);
  const [selectionModeDraft, setSelectionMode] = field("selectionMode");
  const selectionMode = selectionModeDraft ?? false;
  const [sortDraft, setSort] = field("sort");
  const sort: TaskSort = sortDraft ?? "manual";
  const [bulkRequest, setBulkRequest] = useState<BulkRequest | null>(null);
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
  const [editWork] = editField("work", "");
  const [editBuffer] = editField("buffer", "");
  const [editStart] = editField("start", "");
  const [editDate] = editField("date", "");
  const [editPriority, setEditPriority] = editField("priority", "normal");
  const [editDone, setEditDone] = editField("done", false);
  const [editError, setEditError] = useState("");
  const mandalaDraft = workspace.value.mandalaDraft;
  function setMandalaDraft(value: Mandala | null) { workspace.set(current => ({ ...current, mandalaDraft: value, mandalaBase: value ? current.mandalaBase ?? safeMandala(plan.mandala) : null })); }
  const mandala = mandalaDraft ?? safeMandala(plan.mandala);
  const editGoalLinks = editor ? editorGoalIds(editor, plan) : [];
  const oldEditorLinksPending = Boolean(editor && editor.goalLinks === undefined && legacyEditorLinksChanged(editor));
  const [alpenTaskId, setAlpenTaskId] = useState<string | null>(null);
  const submitDestination = useRef<"alpen" | "split" | null>(null);
  const history = useLocalDraft<PlanUndo | null>("undo", null, validUndo);
  const selectedIds = new Set(workspace.value.selectedIds ?? []);
  function setSelectedIds(value: SetStateAction<Set<string>>) {
    workspace.set(current => { const previous = new Set(current.selectedIds ?? []); const next = typeof value === "function" ? value(previous) : value; return { ...current, selectedIds: [...next] }; });
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const replanDialogRef = useRef<HTMLDialogElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editingTask = plan.tasks.find((task) => task.id === editingId);
  const replanTask = plan.tasks.find((task) => task.id === replanId);
  const replanTaskId = replanTask?.id;
  const editingTaskId = editingTask?.id;
  const editTime = parseEditorSchedule({ work: editWork, buffer: editBuffer, start: editStart, date: editDate, timeMode: editor?.timeMode, end: editor?.end, endDate: editor?.endDate, endDay: editor?.endDay });

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

  const rangeTasks = selectRangeTasks(plan.tasks, planDate, range);
  const classifiedTasks = filterClassifiedTasks(plan.tasks, classification);
  const scopedTasks = filterClassifiedTasks(rangeTasks, classification);
  const executionTasks = scopedTasks.filter(task => !task.summaryOnly);
  const active = executionTasks.filter((task) => !task.done);
  const doneCount = executionTasks.length - active.length;
  const day = selectDay(plan.tasks, planDate);
  const filteredDay = selectDay(classifiedTasks, planDate);
  const availability = plan.availabilityByDate?.[planDate] ?? defaultAvailability;
  const allocation = availabilitySummary(day, availability);
  const progress = executionTasks.length ? Math.round(doneCount / executionTasks.length * 100) : 0;
  const rhythmTasks = filteredDay.scheduled;
  const timeline = layoutTimeline(rhythmTasks, { start: Math.min(allocation.window.start, ...allocation.fixed.map(block => block.start)), end: Math.max(allocation.window.end, ...allocation.fixed.map(block => block.end)), maxEnd: 1440 });
  const pixelsPerMinute = 3;
  const visibleTasks = sortTasks(scopedTasks.filter((task) => filter === "all" || (filter === "done" ? task.done && !task.summaryOnly : !task.done && !task.summaryOnly)), sort);
  const selection = selectedTaskSummary(plan.tasks, [...selectedIds], visibleTasks.map(task => task.id));
  const selectedTasks = selection.tasks;
  const allSelected = visibleTasks.length > 0 && selection.visible === visibleTasks.length;
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
    setSelectedIds(current => { const next = new Set(current); for (const task of visibleTasks) { if (allSelected) next.delete(task.id); else next.add(task.id); } return next; });
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
    if (plan.tasks.some((task) => !task.done && !task.summaryOnly && task.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      setError("이미 남아 있는 할 일이에요. 기존 목록을 확인해주세요."); return;
    }
    const categoryId = classification.category.startsWith("category:") ? classification.category.slice(9) : null;
    if (!validTaxonomyReferences([{ categoryId, tagIds: classification.tags }], plan.categories, plan.tags)) { setError("선택한 분류가 삭제됐어요. 필터를 다시 선택하거나 초기화해주세요. 입력은 유지했어요."); return; }
    const task: Task = { id: crypto.randomUUID(), title, minutes: null, bufferMinutes: null, startTime: null, endTime: null, endDate: null, endDayOffset: null, priority: "normal", importance: "normal", dueDate: null, dueTime: null, done: false, plannedDate: range === "all" ? null : planDate, notes: "", categoryId, tagIds: classification.tags };
    if (save({ ...plan, tasks: [...plan.tasks, task] }, "할 일을 추가했어요.")) {
      setInput(""); setFilter("all"); inputRef.current?.focus();
      if (classification.search) { workspace.set(current => ({ ...current, classification: { ...classification, search: "" } })); setNotice({ message: "할 일을 추가하고 검색어를 해제했어요. 분류·태그 필터는 유지돼요." }); }
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
    return deletePlanTasks(plan, ids);
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
      if (save(next, "직전 변경을 되돌렸어요.", false)) { history.set(null); }
    } catch (error) { setError((error as Error).message); }
  }
  function deleteSelected() {
    requestBulk("delete");
  }

  function completeSelected() {
    requestBulk(allSelectedDone ? "undone" : "done");
  }
  function requestBulk(kind: BulkRequest["kind"]) {
    try { setBulkRequest(previewBulkAction(plan, [...selectedIds], visibleTasks.map(task => task.id), kind)); } catch (error) { setError((error as Error).message); }
  }
  function confirmBulk() {
    if (!bulkRequest) return "처리할 대상을 다시 선택해주세요.";
    try {
      const next = applyBulkAction(readLatestPlan(), bulkRequest);
      const message = bulkRequest.tasks.length + (bulkRequest.kind === "delete" ? "개의 할 일을 삭제했어요." : bulkRequest.kind === "done" ? "개의 할 일을 완료했어요." : "개의 완료를 취소했어요.");
      if (!save(next, message)) return "저장하지 못했어요. 선택과 초안은 유지했어요. 저장 공간과 최신 계획을 확인한 뒤 다시 시도해주세요.";
      const ids = new Set(bulkRequest.tasks.map(task => task.id));
      workspace.set(current => { const next = bulkRequest.kind === "delete" ? [...ids].reduce((result, id) => withoutEditor(result, id), current) : current; return { ...next, selectedIds: (next.selectedIds ?? []).filter(id => !ids.has(id)) }; });
      setBulkRequest(null); return null;
    } catch (error) { return (error as Error).message; }
  }
  function moveTask(task: Task, direction: -1 | 1) {
    if (sort !== "manual") { setError("수동 순서에서만 이동할 수 있어요."); return; }
    try { save(moveVisibleTask(plan, visibleTasks.map(task => task.id), task.id, direction), "보이는 할 일의 수동 순서를 바꿨어요. 숨긴 항목은 제자리에 있어요."); } catch (error) { setError((error as Error).message); }
  }

  function toggleDone(task: Task) {
    if (task.summaryOnly) { setError("요약 업무는 완료율과 시간 집계에서 제외돼요. 나눈 실행 업무를 완료해주세요."); return; }
    if (task.done && plan.tasks.some((item) => item.id !== task.id && !item.done && !item.summaryOnly && item.title.toLocaleLowerCase() === task.title.toLocaleLowerCase())) {
      setError("같은 내용의 진행 중인 항목이 있어 완료를 취소할 수 없어요."); return;
    }
    save({ ...plan, tasks: plan.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) },
      task.done ? "완료를 취소했어요." : "하나 끝냈어요. 잘했어요!");
  }

  function changeFilter(value: Filter) {
    changeView("list");
    setFilter(value);
  }

  function changeView(value: View) {
    if (["alpen", "stats", "rhythm"].includes(value)) setRange("day");
    setView(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function navigateRange(value: RangeScope) {
    workspace.set(current => ({ ...current, range: value, view: "list", selectedDate: value === "all" ? current.selectedDate : koreanToday() }));
    setFilter("all"); setError("");
  }

  function editorFrom(task: Task): EditorDraft {
    return { base: task, baseMandala: safeMandala(plan.mandala), baseGoalTree: plan.goalTree, goalLinks: taskGoalIds(plan.goalTree, task.id), title: task.title, notes: task.notes ?? "", importance: task.importance ?? "normal", dueDate: task.dueDate ?? "", dueTime: task.dueTime ?? "", categoryId: task.categoryId ?? null, tagIds: task.tagIds ?? [], work: workFromStoredTime(task.minutes, task.bufferMinutes), buffer: task.bufferMinutes === null ? "" : String(task.bufferMinutes), start: task.startTime ?? "", date: task.plannedDate ?? "", timeMode: task.startTime || task.minutes === null ? "clock" : "duration", end: task.endTime ?? "", endDate: task.endDate ?? task.plannedDate ?? "", endDay: String(task.endDayOffset ?? 0), priority: task.priority, done: task.done, links: mandala.areas.flatMap((area, a) => area.taskIds.flatMap((id, c) => id === task.id ? [a + ":" + c] : [])) };
  }
  function openEditor(task: Task) {
    // Timeline entries also carry layout fields; compare drafts with the saved task only.
    const savedTask = plan.tasks.find(item => item.id === task.id);
    if (!savedTask) { setError("이 할 일은 다른 화면에서 삭제됐어요. 최신 목록을 확인해주세요."); return; }
    workspace.set(current => ({ ...current, editingId: savedTask.id, editors: { ...current.editors, [savedTask.id]: Object.hasOwn(current.editors, savedTask.id) ? current.editors[savedTask.id] : editorFrom(savedTask) } }));
    setEditError("");
  }
  function discardEditor() { if (editingId) workspace.set(current => withoutEditor(current, editingId)); setEditError(""); }
  function patchEditor(patch: Partial<EditorDraft>) {
    workspace.set(current => { const id = current.editingId; if (!id || !current.editors[id]) return current; return { ...current, editors: { ...current.editors, [id]: { ...current.editors[id], ...patch } } }; });
    setEditError("");
  }
  function changeEditorDate(date: string) {
    if (editor) patchEditor(retargetEditorDate(editor, date));
  }
  const editorConflict = Boolean(editor && editingTask && (!sameValue(taskToV4(editor.base), editingTask) || editorGoalConflict(editor, plan)));
  const goalConflict = Boolean(mandalaDraft && workspace.value.mandalaBase && !sameValue(workspace.value.mandalaBase, safeMandala(plan.mandala)));

  function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) { setEditingId(null); return; }
    try { if (!sameValue(readLatestPlan(), plan)) { setEditError("저장된 계획이 갱신됐어요. 다시 확인한 뒤 저장해주세요."); return; } } catch (error) { setEditError((error as Error).message); return; }
    if (editorConflict) { setEditError("저장된 업무나 목표가 바뀌었어요. 아래에서 사용할 내용을 선택해주세요."); return; }
    const task = editingTask;
    const categoryId = editor?.categoryId === undefined ? task.categoryId ?? null : editor.categoryId;
    const tagIds = editor?.tagIds ?? task.tagIds ?? [];
    if (!validTaxonomyReferences([{ categoryId, tagIds }], plan.categories, plan.tags)) { setEditError("삭제된 분류나 태그가 있어요. 분류·태그에서 다시 선택하거나 연결을 해제해주세요. 입력은 유지했어요."); return; }
    const importance = editor?.importance ?? task.importance ?? "normal";
    const dueDate = (editor?.dueDate ?? task.dueDate) || null, dueTime = (editor?.dueTime ?? task.dueTime) || null;
    if (!validTaskPlanning({ importance, dueDate, dueTime })) { setEditError("마감 날짜와 시각을 확인해주세요. 시각만 입력할 수 없어요. 입력은 초안으로 유지했어요."); return; }
    const title = editTitle.trim();
    const { minutes: duration, bufferMinutes: buffer, error: timeError } = editTime;
    if (!title) { setEditError("수정할 내용을 입력해주세요."); return; }
    if (timeError) { setEditError(timeError); return; }
    if (editDate && !isPlanDate(editDate)) { setEditError("계획 날짜를 올바르게 선택해주세요."); return; }
    if (!task.summaryOnly && !editDone && plan.tasks.some((item) => item.id !== task.id && !item.done && !item.summaryOnly && item.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
      setEditError("같은 내용의 할 일이 이미 있어요."); return;
    }
    if (oldEditorLinksPending) { setEditError("이전 목표 연결 초안을 아래에서 확인한 뒤 저장해주세요."); return; }
    let linkedPlan: Plan;
    try { linkedPlan = setTaskGoalLinks(plan, task.id, editGoalLinks); } catch (error) { setEditError((error as Error).message); return; }
    const destination = submitDestination.current;
    let editedPlan: Plan = { ...linkedPlan, tasks: plan.tasks.map((item) => item.id === task.id ? { ...item, title, notes: editNotes ?? "", importance, dueDate, dueTime, categoryId, tagIds, minutes: duration, bufferMinutes: buffer, startTime: editTime.startTime, endTime: editTime.endTime, endDate: editTime.endDate, endDayOffset: editTime.endDayOffset, plannedDate: editDate || null, priority: editPriority, done: task.summaryOnly ? task.done : editDone } : item) };
    try { if (destination === "split") editedPlan = splitTask(editedPlan, task.id, (editor?.splitTitles ?? ["", ""]).map(title => ({ id: crypto.randomUUID(), title })), editor?.splitSummary ?? true); } catch (error) { setEditError((error as Error).message); return; }
    if (save(editedPlan, destination === "split" ? "실행 업무로 나눴어요. 실행 취소로 복구할 수 있어요." : "내용을 수정했어요.")) {
      workspace.set(current => withoutEditor(current, task.id));
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
            {planningView && range === "day" && isPlanDate(planDate) && <DayAvailability day={day} saved={plan.availabilityByDate?.[planDate]} onSave={value => save({ ...plan, availabilityByDate: { ...plan.availabilityByDate, [planDate]: value } }, "활동 시간과 고정·휴식을 저장했어요.")} onEdit={openEditor} />}
            {planningView && <><ClassificationFilters plan={plan} value={classification} onChange={changeClassification} count={scopedTasks.length} total={rangeTasks.length} /><ClassificationManager plan={plan} onSave={save} /></>}
            {history.value && <div className="oddk-undoBar"><small>{history.value.label}</small><button type="button" onClick={undoLatest} title="이 기기의 최근 변경1건을 되돌려요. 다음 저장 시 교체되며 이후 바뀐 내용은 덮지 않아요."><HiOutlineArrowUturnLeft aria-hidden="true" />최근 변경 되돌리기</button></div>}
            {history.problem && <DraftFeedback draft={history} />}
            {view !== "list" && <DraftFeedback draft={workspace} />}
      {Object.entries(workspace.value.editors).filter(([id]) => !plan.tasks.some(t => t.id === id)).map(([id, draft]) => <section className="oddk-draftRecovery" key={id}><strong>삭제된 할 일의 초안</strong><p>{draft.title}</p><button type="button" onClick={() => { setInput(draft.title); changeView("list"); }}>추가 입력란으로 복사</button><button type="button" onClick={() => workspace.set(current => withoutEditor(current, id))}>이 초안 폐기</button><button type="button" onClick={workspace.download}>초안 백업 받기</button></section>)}

            {selectedIds.size > 0 && <section className="oddk-selectionDock" aria-label="여러 날짜 선택한 할 일"><p role="status">총 {selectedTasks.length}개 선택 · 화면 내 {selection.visible}개 · 숨긴 선택 {selection.hidden}개{selection.missing > 0 && <span> · 삭제된 항목 {selection.missing}개는 처리에서 제외</span>}</p><div className="oddk-bulkActions"><button type="button" disabled={!selectedTasks.length} onClick={completeSelected}><HiOutlineCheck aria-hidden="true" />{allSelectedDone ? "완료 취소 대상 확인" : "완료 대상 확인"}</button><button type="button" disabled={!selectedTasks.length} onClick={deleteSelected}><HiOutlineTrash aria-hidden="true" />삭제 대상 확인</button><button type="button" onClick={() => setSelectedIds(new Set())}><HiOutlineXMark aria-hidden="true" />모든 선택 해제</button>{selection.missing > 0 && <button type="button" onClick={() => setSelectedIds(new Set(selectedTasks.map(task => task.id)))}>삭제된 선택 정리</button>}</div></section>}
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
                  <button className="oddk-selectionToggle" type="button" aria-pressed={selectionMode} onClick={() => setSelectionMode(!selectionMode)}>{selectionMode ? "선택 끝내기" : "선택"}</button>
                </div>

                <div className="oddk-sortControl"><label>표시 순서<select value={sort} onChange={event => setSort(event.target.value as TaskSort)}><option value="manual">수동 순서</option><option value="importance">중요도 높은 순</option><option value="deadline">마감 빠른 순</option></select></label><small>{sort === "manual" ? "위·아래 버튼으로 순서 변경 · 숨긴 항목은 제자리" : "표시만 변경 · 저장된 수동 순서는 유지"}</small></div>
                {selectionMode && <div className="oddk-selectionBar">
                  <SelectionCheckbox label="현재 목록 전체 선택" checked={allSelected} disabled={visibleTasks.length === 0} mixed={selection.visible > 0 && !allSelected} onChange={toggleSelectAll} />
                  <button type="button" disabled={visibleTasks.length === 0} onClick={toggleSelectAll}>전체 선택</button>
                  <span>화면 내 {selection.visible}개 선택 · 숨긴 선택 {selection.hidden}개</span>
                </div>}


                {error && <p className="oddk-error" role="alert">{error}</p>}

                {visibleTasks.length === 0 ? <div className="oddk-empty">
                  <HiOutlineClipboardDocumentCheck aria-hidden="true" />
                  {(classification.category !== "all" || classification.tags.length > 0 || classification.search) ? <><h3>필터에 맞는 할 일이 없어요</h3><p>다른 분류·태그·검색어를 선택하거나 필터를 초기화해보세요.</p><button type="button" onClick={() => changeClassification(defaultClassification)}>필터 초기화</button></> : <><h3>{filter === "done" ? "작은 완료가 쌓일 자리예요" : filter === "active" && doneCount > 0 ? "모든 할 일을 마쳤어요!" : "아직 비어 있는 하루예요"}</h3>
                  <p>{filter === "done" ? "끝낸 일을 체크하면 여기에 보여요." : filter === "active" && doneCount > 0 ? "필요할 때 다음 할 일을 더해보세요." : "첫 번째 할 일을 가볍게 적어보세요."}</p></>}
                </div> : <ul className="oddk-taskList">
                  {visibleTasks.map((task, index) => { const portion = range === "day" ? taskDaySlice(task, planDate) : null; return <li key={task.id} className={"oddk-task" + (task.done ? " oddk-completed" : "") + (selectionMode && selectedIds.has(task.id) ? " oddk-selected" : "")}>
                    <SelectionCheckbox id={"task-" + task.id} checked={selectionMode ? selectedIds.has(task.id) : task.done}
                      round={!selectionMode} disabled={!selectionMode && task.summaryOnly} label={task.title + (selectionMode ? " 선택" : " 완료")}
                      onChange={() => selectionMode ? toggleSelection(task.id) : toggleDone(task)} />
                    <button type="button" className="oddk-taskContent" aria-label={task.title + " 상세 수정"} onClick={() => openEditor(task)}>
                      <span className="oddk-taskTitle" title={task.title}><span className="oddk-taskSequence" aria-label={"표시 순서 " + (index + 1)}>{index + 1}.</span>{task.title}</span>
                      <ClassificationBadges task={task} plan={plan} />{task.summaryOnly && <span>요약 · 완료율·시간 집계 제외</span>}{task.parentTaskId && <span>상위 업무: {plan.tasks.find(parent => parent.id === task.parentTaskId)?.title ?? "연결 해제됨"}</span>}
                      <span className="oddk-taskDetails">
                        <TaskPlanningBadges task={task} date={today} time={nowTime} />
                        <span aria-hidden="true" className="oddk-detailDot">·</span>
                        <span className={"oddk-taskTime" + (!hasTime(task) ? " oddk-unset" : "")}
                          title={!hasTime(task) ? "항목을 눌러 시간을 설정해주세요" : "작업 " + (task.minutes - task.bufferMinutes) + "분 / 수행 " + task.minutes + "분, 포함된 여유 " + task.bufferMinutes + "분"}
                          aria-label={!hasTime(task) ? "시간 미설정" : "작업 " + (task.minutes - task.bufferMinutes) + "분, 수행 " + task.minutes + "분, 포함된 여유 " + task.bufferMinutes + "분"}>
                          {hasTime(task) ? <>{task.minutes - task.bufferMinutes} / {task.minutes}<small>분</small></> : "시간 미설정"}
                        </span>
                        {task.startTime && <span className="oddk-taskStart"><HiOutlineClock aria-hidden="true" />{task.startTime}</span>}
                        {task.plannedDate && <time dateTime={task.plannedDate} className="oddk-taskDate">{task.plannedDate}</time>}
                        {portion && portion.segmentMinutes !== task.minutes && <span>이 날짜 {portion.segmentMinutes}분 · {portion.continuesBefore ? "전날부터 이어짐" : "다음 날 계속"}</span>}
                      </span>
                    </button>
                    {sort === "manual" && <TaskMoveButtons title={task.title} first={index === 0} last={index === visibleTasks.length - 1} onMove={direction => moveTask(task, direction)} />}
                    {!selectionMode && !task.done && today && task.plannedDate && task.plannedDate < today && <button type="button" className="oddk-replanButton" aria-label={task.title + " 다시 계획"} onClick={() => { setReplanDate(koreanToday()); setReplanError(""); setReplanId(task.id); }}><HiOutlineArrowUturnLeft aria-hidden="true" />다시 계획</button>}
                    {task.done && <span className="oddk-doneBadge">완료</span>}
                  </li>; })}
                </ul>}

                <p className="oddk-addTarget">{range === "all" ? "날짜 없이 추가" : isPlanDate(planDate) ? `${dayLabel(planDate)}에 추가` : "계획 날짜를 선택해주세요"}{classification.category.startsWith("category:") && ` · ${plan.categories?.find(c => `category:${c.id}` === classification.category)?.name ?? "삭제된 카테고리"}`}{classification.tags.length > 0 && ` · ${classification.tags.map(id => "#" + (plan.tags?.find(t => t.id === id)?.name ?? "삭제된 태그")).join(" ")}`}</p>
                <form onSubmit={addTask} className="oddk-addForm">
                  <button type="submit" aria-label="할 일 추가" disabled={!today}><HiOutlinePlus aria-hidden="true" /></button>
                  <AutoTextarea ref={inputRef} id="todo-input" aria-label="할 일 입력" disabled={!today} value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} aria-describedby="todo-input-count" onLimit={() => setError("할 일 제목은120자까지 입력할 수 있어요. 긴 내용은 상세 메모에 적어주세요. 기존 입력은 유지했어요.")}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} title="Enter로 추가, Shift+Enter로 줄바꿈"
                    maxLength={120} placeholder={today ? "떠오르는 할 일을 적어보세요" : "저장된 할 일을 불러오고 있어요"} autoComplete="off" />
                </form>

                <small id="todo-input-count" className="oddk-inputCount">{input.length}/120</small>
                <DraftFeedback draft={workspace} />
                <div className="oddk-dayProgress">
                  <div><span>이 범위 실행 업무 {executionTasks.length}개 중 {doneCount}개 완료</span><strong>{progress}%</strong></div>
                  <progress aria-label="현재 범위의 할 일 완료율" max={100} value={progress} />
                </div>
              </section>

              <aside hidden={!planningView || range !== "day"} className="oddk-rhythm" aria-labelledby="rhythm-title">
                <h2 id="rhythm-title">시간표</h2>
                {rhythmTasks.length === 0 && allocation.fixed.length === 0 ? <div className="oddk-rhythmEmpty"><HiOutlineClock aria-hidden="true" /><p>{day.scheduled.length > 0 ? "필터에 맞는 시간표 일정이 없어요. 필터를 초기화하면 모든 일정을 볼 수 있어요." : day.tasks.length > 0 && day.active.length === 0 ? "선택한 날짜의 할 일을 모두 마쳤어요." : day.active.length > 0 ? "할 일에 시작·종료 시각과 여유를 정해주세요." : "목록에서 할 일을 추가하고 시간을 정해주세요."}</p></div> : <>
                  <div className="oddk-timelineLegend" aria-label="시간표 구분"><span><i />작업</span><span><i />여유</span><span><i />고정·휴식</span></div>
                  <div className="oddk-timelineScroll" tabIndex={0} role="region" aria-label={`${planDate} 시간표. 일정을 누르면 수정할 수 있어요.`}>
                    <div className="oddk-timeline" style={{ height: (timeline.end - timeline.start) * pixelsPerMinute + 24, minWidth: 62 + timeline.columns * 84 }}>
                      {Array.from({ length: (timeline.end - timeline.start) / 30 + 1 }, (_, index) => {
                        const minute = timeline.start + index * 30;
                        return <div key={minute} className={"oddk-timeTick" + (minute % 60 ? " oddk-halfHour" : "")} style={{ top: (minute - timeline.start) * pixelsPerMinute + 12 }}>
                          <time>{clockLabel(minute)}</time><span />
                        </div>;
                      })}
                      <div className="oddk-timelineEvents">
                        {allocation.fixed.map(block => <div key={block.id} className="oddk-fixedSlot" style={{ top: (block.start - timeline.start) * pixelsPerMinute + 12, height: (block.end - block.start) * pixelsPerMinute }}><strong>{block.title}</strong><span>{clockLabel(block.start)}~{clockLabel(block.end)} · 고정·휴식</span></div>)}
                        {timeline.items.map((task) => {
                          const work = task.segmentWork;
                          const conflict = task.conflict || allocation.overlaps.some(item => item.task.id === task.id);
                          const description = `${task.title}, ${clockLabel(task.start)}부터 ${clockLabel(task.end)}, 이 날짜의 작업 ${work}분, 여유 ${task.segmentBuffer}분${task.continuesBefore ? ", 전날부터 이어짐" : ""}${task.continuesAfter ? ", 다음 날 계속" : ""}${conflict ? ", 시간 겹침" : ""}`;
                          return <button key={task.id} type="button" className="oddk-timeSlot" data-conflict={conflict}
                            style={{ top: (task.start - timeline.start) * pixelsPerMinute + 12, height: task.segmentMinutes * pixelsPerMinute, left: `${task.lane / task.columns * 100}%`, width: `calc(${100 / task.columns}% - 5px)` }}
                            aria-label={description + ", 시간 수정"} title={description} onClick={() => openEditor(task)}>
                            {work > 0 && <span className="oddk-slotWork" style={{ height: work * pixelsPerMinute }}>
                              <strong>{task.title}</strong><span>{clockLabel(task.start)} – {clockLabel(task.start + work)}</span>
                              <span>작업 {work}분{task.continuesBefore ? " · 전날부터" : ""}{task.continuesAfter ? " · 다음 날 계속" : ""}{conflict ? " · 시간 겹침" : ""}</span>
                            </span>}
                            {task.segmentBuffer > 0 && <span className="oddk-slotBuffer" style={{ height: task.segmentBuffer * pixelsPerMinute }}>
                              {!work && <strong>{task.title} · {task.continuesBefore ? "전날부터 이어진 여유" : "여유"}</strong>}<span>여유 {task.segmentBuffer}분</span>
                            </span>}
                          </button>;
                        })}
                      </div>
                    </div>
                  </div>
                </>}
                {rhythmTasks.some(task => task.segmentMinutes < 20) && <ul className="oddk-shortSlots" aria-label="짧은 시간표 구간">{rhythmTasks.filter(task => task.segmentMinutes < 20).map(task => <li key={task.id}><button type="button" onClick={() => openEditor(task)}>{clockLabel(task.start)}~{clockLabel(task.end)} · {task.title} · 이 날짜 {task.segmentMinutes}분{task.continuesBefore ? " · 전날부터 이어짐" : ""}{task.continuesAfter ? " · 다음 날 계속" : ""}</button></li>)}</ul>}
                <p className="oddk-rhythmNote"><GoDotFill aria-hidden="true" />여유도 계획의 일부예요.</p>
              </aside>
              <div hidden={view !== "mandala"}>
                <GoalTreeView plan={plan} onEdit={openEditor} onSave={(tree, expected) => {
                  if (!sameValue(expected, plan.goalTree)) { setError("목표가 바뀌었어요. 최신 내용과 초안을 확인해주세요."); return false; }
                  try { return save(saveGoalTree(plan, tree), "목표를 저장했어요."); } catch (error) { setError((error as Error).message); return false; }
                }} />
                {mandalaDraft && <details open><summary>이전 만다라트 작성 중 초안</summary><p>새 목표와 별도로 남겨둔 이전 초안이에요. 가져오면 변경한 부분만 반영하고 새로 만든 세부 목표는 유지해요.</p>{goalConflict && <p role="alert">이전 저장본도 바뀌었어요. 초안과 현재 목표를 비교해주세요.</p>}<button type="button" onClick={() => { workspace.download(); setMandalaDraft(null); }}>이전 초안 백업 후 취소</button><MandalaView tasks={plan.tasks} draft={mandala} dirty onChange={setMandalaDraft} onSave={draft => {
                  workspace.download();
                  try { const next = mergeLegacyGoalDraft(plan, workspace.value.mandalaBase ?? safeMandala(plan.mandala), draft); const saved = save(next, "이전 목표 초안을 가져왔어요."); if (saved) setMandalaDraft(null); return saved; } catch (error) { setError((error as Error).message); return false; }
                }} onEdit={openEditor} onList={() => changeView("list")} /></details>}
              </div>
            </div>
            {planningView && range === "day" && <div className="oddk-dayDetails"><details open={view === "alpen"}><summary><HiOutlineClipboardDocumentCheck aria-hidden="true" />하루 계획과 점검</summary><AlpenView day={filteredDay} onEdit={openEditor} onList={() => changeView("list")} onRhythm={() => changeView("rhythm")} selectedTaskId={view === "alpen" ? alpenTaskId : null} /><DailyReview date={planDate} reviews={plan.reviewsByDate} legacy={typeof plan.review === "string" ? plan.review : ""} onSave={submitReview} onMoveLegacy={transferLegacyReview} onUseSaved={keepReviewDraft} onBackup={() => exportPlanBackup(EMPTY_SNAPSHOT, true)} /></details><details open={view === "stats"}><summary><HiOutlineChartBar aria-hidden="true" />시간 분석</summary><TimeStatsView day={filteredDay} /></details></div>}
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
          <TaskClassificationFields plan={plan} categoryId={editor?.categoryId === undefined ? editingTask.categoryId ?? null : editor.categoryId} tagIds={editor?.tagIds ?? editingTask.tagIds ?? []} onChange={patchEditor} />
          <TaskPlanningFields importance={editor?.importance ?? editingTask.importance ?? "normal"} dueDate={editor?.dueDate ?? editingTask.dueDate ?? ""} dueTime={editor?.dueTime ?? editingTask.dueTime ?? ""} onChange={patchEditor} />
          <div className="oddk-editorMeta">
            <details className="oddk-legacyPriority"><summary>기존 우선순위 설정</summary><fieldset className="oddk-editorPriority"><legend>이전 우선순위 · 별도 보관</legend>
              <div className="oddk-priorityOptions">{(["low", "normal", "high"] as const).map((priority) => (
                <label key={priority}><input type="radio" name="edit-priority" value={priority} className="oddk-srOnly"
                  checked={editPriority === priority} onChange={() => setEditPriority(priority)} /><span>{priorities[priority].label}</span></label>
              ))}</div>
            </fieldset></details>
            <label className="oddk-dialogField oddk-editorStatus" htmlFor="edit-status">상태
              <span className="oddk-editorSelect"><select id="edit-status" disabled={editingTask.summaryOnly} value={editDone ? "done" : "active"} onChange={(event) => setEditDone(event.target.value === "done")}>
                <option value="active">진행 중</option><option value="done">완료</option>
              </select><HiOutlineChevronDown aria-hidden="true" /></span>
            </label>
          </div>
          <div className="oddk-editorDate"><label className="oddk-dialogField" htmlFor="edit-date">계획 날짜<input id="edit-date" type="date" min="0001-01-01" max="9999-12-31" value={editDate} onChange={(event) => changeEditorDate(event.target.value)} aria-describedby="edit-date-guide" /></label><div><button type="button" disabled={!today} onClick={() => changeEditorDate(koreanToday())}>오늘로 지정</button><button type="button" disabled={!editDate} onClick={() => changeEditorDate("")}>날짜 해제</button></div><small id="edit-date-guide">{editDate ? "이 날짜의 시간표·계획·통계에 포함돼요." : "날짜를 정하기 전에는 목록에만 보관해요. 시간 설정은 유지돼요."}</small></div>
          <details open className="oddk-dialogTimes oddk-editorDisclosure">
            <summary><HiOutlineChevronDown aria-hidden="true" /><span>시간 설정</span><span className="oddk-editorOptional">선택</span>
              {(editWork || editBuffer || editStart || editor?.end) && <button type="button" className="oddk-clearTime" aria-label="시간 설정 지우기" title="시간 설정 지우기"
                onClick={(event) => { event.preventDefault(); patchEditor({ work: "", buffer: "", start: "", end: "", endDate: editDate, endDay: "0", timeMode: "clock" }); }}><HiOutlineArrowUturnLeft aria-hidden="true" /></button>}
            </summary>
            {editor && <TaskScheduleFields draft={editor} onChange={patchEditor} />}
          </details>
          <details className="oddk-dialogLinks oddk-editorDisclosure" open={editGoalLinks.length > 0 || oldEditorLinksPending}>
            <summary><HiOutlineChevronDown aria-hidden="true" /><span>목표 연결<small>같은 할 일을 여러 세부 목표와 연결해요</small></span></summary>
            <div className="oddk-dialogLinkContent">
              {oldEditorLinksPending && <section role="alert"><p>이전 칸 연결 초안이 남아 있어요. 새 목표 연결로 가져오거나 현재 연결을 선택해주세요. 다른 입력은 유지돼요.</p><button type="button" onClick={() => { workspace.download(); try { if (editor) patchEditor({ goalLinks: convertLegacyEditorLinks(editor, plan), baseGoalTree: plan.goalTree }); } catch (error) { setEditError((error as Error).message); } }}>백업 후 이전 연결 가져오기</button><button type="button" onClick={() => { workspace.download(); patchEditor({ goalLinks: taskGoalIds(plan.goalTree, editingTask.id), baseGoalTree: plan.goalTree }); }}>백업 후 현재 연결 사용</button></section>}
              {plan.goalTree.groups.map((group, index) => <label key={group.id}><input type="checkbox" disabled={oldEditorLinksPending} checked={editGoalLinks.includes(group.id)} onChange={event => patchEditor({ goalLinks: event.target.checked ? [...editGoalLinks, group.id] : editGoalLinks.filter(id => id !== group.id) })} />{group.title || "세부 목표 " + (index + 1)}</label>)}
              {editGoalLinks.filter(id => !plan.goalTree.groups.some(group => group.id === id)).map(id => <p key={id}>삭제된 목표: {id} <button type="button" onClick={() => patchEditor({ goalLinks: editGoalLinks.filter(value => value !== id) })}>연결 해제</button></p>)}
              {!plan.goalTree.groups.length && <p>목표 화면에서 세부 목표를 먼저 추가해주세요.</p>}
              <p>연결·해제는 저장할 때 반영돼요. 작성 중인 목표 초안은 따로 보존돼요.</p>
            </div>
          </details>
          <details className="oddk-editorDisclosure oddk-taskSplit"><summary>작은 실행 업무로 나누기</summary><p>현재 수정 내용도 함께 저장해요. 새 업무는 날짜·분류·목표를 이어받고 시간은 각각 직접 정해요.</p>
            {(editor?.splitTitles ?? ["", ""]).map((title, index, titles) => <div key={index}><label htmlFor={"split-title-" + index}>실행 업무 {index + 1}<input id={"split-title-" + index} maxLength={120} value={title} onChange={event => patchEditor({ splitTitles: titles.map((value, i) => i === index ? event.target.value : value) })} /></label>{titles.length > 2 && <button type="button" onClick={() => patchEditor({ splitTitles: titles.filter((_, i) => i !== index) })}>실행 업무 {index + 1} 제거</button>}</div>)}
            <button type="button" disabled={(editor?.splitTitles?.length ?? 2) >= 32} onClick={() => patchEditor({ splitTitles: [...(editor?.splitTitles ?? ["", ""]), ""] })}><HiOutlinePlus aria-hidden="true" />실행 업무 추가</button>
            <fieldset><legend>원본 업무 처리</legend><label><input type="radio" name="split-mode" checked={editor?.splitSummary ?? true} onChange={() => patchEditor({ splitSummary: true })} />요약으로 보관 — 원본 시간은 보존하고 집계에서 제외</label><label><input type="radio" name="split-mode" checked={editor?.splitSummary === false} onChange={() => patchEditor({ splitSummary: false })} />원본도 별도로 실행 — 원본 시간도 계속 집계</label></fieldset>
            <p>새 실행 업무 {(editor?.splitTitles?.length ?? 2)}개 · 시간 미설정. 요약 선택 시 원본은 완료율과 시간표에서 제외돼요.</p>
            <button type="button" onClick={event => { submitDestination.current = "split"; try { event.currentTarget.form?.requestSubmit(); } finally { submitDestination.current = null; } }}>수정 내용 저장하고 나누기</button>
          </details>
          <button type="button" className="oddk-openAlpen" disabled={!editDate} aria-describedby={!editDate ? "edit-date-guide" : undefined} onClick={(event) => { submitDestination.current = "alpen"; try { event.currentTarget.form?.requestSubmit(); } finally { submitDestination.current = null; } }}><HiOutlineArrowRight aria-hidden="true" />저장 후 하루 계획 보기</button>
          </div>
          <DraftFeedback draft={workspace} />
          {editorConflict && <section className="oddk-draftConflict" role="alert"><strong>저장된 업무나 목표가 바뀌었어요. 초안은 그대로 있어요.</strong><p>저장본: {editingTask?.title} / 내 초안: {editTitle}</p><p>저장된 메모: {editingTask?.notes || "없음"}<br />내 메모: {editNotes || "없음"}</p><button type="button" onClick={() => { workspace.download(); if (editingTask) workspace.set(current => ({ ...current, editors: { ...current.editors, [editingTask.id]: editorFrom(editingTask) } })); }}>초안 백업 후 저장본 사용</button><button type="button" onClick={() => { workspace.download(); if (editingTask && editingId) workspace.set(current => ({ ...current, editors: { ...current.editors, [editingId]: { ...current.editors[editingId], base: editingTask, baseMandala: safeMandala(plan.mandala), baseGoalTree: plan.goalTree } } })); }}>백업 후 내 초안으로 계속 편집</button></section>}
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
      {bulkRequest && <BulkActionDialog request={bulkRequest} onCancel={() => setBulkRequest(null)} onConfirm={confirmBulk} />}
      <div className={notice ? "oddk-toast" : "oddk-srOnly"} role="status" aria-live="polite" aria-atomic="true">
        {notice && <><span>{notice.message}</span>{history.value && <button type="button" onClick={undoLatest}>실행 취소</button>}<button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}><HiOutlineXMark aria-hidden="true" /></button></>}
      </div>
    </div>
  );
}
