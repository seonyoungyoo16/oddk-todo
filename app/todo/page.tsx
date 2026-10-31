"use client";
import { TaskSplitAction } from "./task-split-action";
import { WorkspaceHeader } from "./workspace-header";
import { usePlanningAlerts } from "./use-planning-alerts";
import { PlanningAlert, PlanningIssuesButton, PlanningIssueBadge } from "./planning-alert";
import { ActivityHours } from "./activity-hours";
import { addTaskCandidates } from "./batch-tasks";
import { ExecutionPanel } from "./execution-panel";
import { TaskExecutionControl } from "./task-execution-control";
import { ExecutionHistoryPage } from "./execution-history-page";
import { useExecution } from "./use-execution";
import { HiOutlineBars3, HiOutlineFunnel, HiOutlineCog6Tooth, HiOutlineChartBar } from "react-icons/hi2";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, SetStateAction } from "react";
import { HiOutlineXMark, HiOutlineCheck, HiOutlineMinus, HiOutlineTrash, HiOutlineArrowUturnLeft, HiOutlineClipboardDocumentCheck, HiOutlineSun, HiOutlineListBullet, HiOutlineSquares2X2, HiOutlineClock, HiOutlineChevronDown } from "react-icons/hi2";
import { TaskImportanceFields, BulkActionDialog } from "./task-planning-controls";
import { sortTasks, moveVisibleTask, selectedVisibleTasks, taskImportance } from "./task-order";
import { dropVisibleTask, shiftStart, previewTimeMove, applyTimeMove } from "./task-movement";
import type { TimeMovePreview } from "./task-movement";
import { TaskRow } from "./task-row";
import { WeeklyTimetable } from "./weekly-timetable";
import { TimetablePlacementDialog } from "./timetable-placement-dialog";
import { applyNewTimetableTask, applyTimetablePlacement, previewTimetablePlacement } from "./weekly-timetable-model";
import type { TimetablePlacementDuration, TimetablePlacementPreview } from "./weekly-timetable-model";
import { TimeMoveDialog } from "./time-move-dialog";
import { applyTaskDuration, previewTaskDuration } from "./task-duration";
import type { TaskDurationPreview } from "./task-duration";
import { TaskDurationDialog } from "./task-duration-dialog";
import { initialRepeatDraft } from "./repeat-editor-model";
import { RepeatMaintenance } from "./repeat-maintenance";
import type { TaskSort } from "./task-order";
import { previewBulkAction, applyBulkAction } from "./bulk-actions";
import type { BulkRequest } from "./bulk-actions";
import { saveGoalTree } from "./goal-actions";
import { GoalTreeView } from "./goal-tree-view";
import { taskGoalIds } from "./goal-editor";
import { TaskTimeFields } from "./task-time-fields";
import { TaskStartFields } from "./task-start-fields";
import { DialogHeader } from "./ui/dialog-header";
import { updateSimpleTask } from "./simple-task-editor";
import { taskTimeLabel } from "./task-time-label";
import { workFromStoredTime } from "./task-time";
import { selectDay } from "./day-selectors";
import { keepFocusInDialog } from "./dialog-focus";
import { rescheduleTask } from "./planning-actions";
import { safeMandala } from "./planning-views";
import type { Plan, Task } from "../../supabase/functions/_shared/plan";
import { hasTaskTime, isPlanDate, validPlan } from "../../supabase/functions/_shared/plan";
import { koreanToday } from "./plan-date";
import { dayLabel, weekDates, selectRangeTasks } from "./calendar-range";
import type { RangeScope } from "./calendar-range";
import { loadPlan, taskToV4 } from "../../supabase/functions/_shared/plan-migration";
import { AutoTextarea } from "./auto-textarea";
import { ClassificationBadges, defaultClassification } from "./classification-controls";
import { TaskTagEditor } from "./task-tag-editor";
import { SettingsPanel } from "./settings-panel";
import { filterClassifiedTasks } from "./classification-actions";
import { sameValue } from "./json-equality";
import { preserveManualRepeatEdits } from "../../supabase/functions/_shared/repeat-actions";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { emptyWorkspace, validWorkspace, withoutEditor } from "./workspace-draft";
import type { WorkspaceDraft, EditorDraft, DraftView } from "./workspace-draft";
import initialPlan from "./initial-plan.json";
import { SyncPanel } from "./sync-panel";
import { syncClient } from "./supabase-client";
import { getPlanSnapshot, getPlanScope, subscribePlan, writePlan, exportPlanBackup, restoreLastValidPlan } from "./sync-store";

type View = Exclude<DraftView, "dashboard" | "alpen" | "stats" | "review"> | "history";
const viewHeaders: Record<View, { title: string; description: string }> = {
  history: { title: "작업이력", description: "" },
  settings: { title: "환경설정", description: "" },
  list: { title: "생각나는 태스크를 모두 적어주세요.", description: "목표는 무엇을 끝낼지 명확히 하고, 막히는 일을 빨리 발견하는 것" },
  rhythm: { title: "오늘 할 일을 시간에 맞춰 배치해요.", description: "작업할 시간과 여유 시간을 나누고, 겹치는 일정이 없는지 확인해요." },
  mandala: { title: "목표추적", description: "가운데 핵심 목표와 세부 목표를 적고, 주변 칸에 실행할 일을 연결하세요." },
};
type Filter = "all" | "active" | "done";

const THEME_KEY = "oddk.theme.v1";
const THEME_EVENT = "oddk-theme-change";
const EMPTY_PLAN: Plan = (() => { const loaded = loadPlan(JSON.stringify(initialPlan)); if (!loaded.ok) throw new Error("기본 계획을 읽지 못했어요. 원문을 확인해주세요."); return loaded.plan; })();
const EMPTY_SNAPSHOT = JSON.stringify(EMPTY_PLAN);
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

function getThemeSnapshot(): "light" | "dark" {
  try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}


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
  return <TodoWorkspace key={scope} scope={scope} />;
}

function TodoWorkspace({ scope }: { scope: string }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
  const planLoad = useMemo(() => loadPlan(snapshot), [snapshot]);
  const plan = planLoad.ok ? planLoad.plan : EMPTY_PLAN;
  const today = useSyncExternalStore(subscribeToday, koreanToday, () => "");
  const workspace = useLocalDraft("workspace", emptyWorkspace, validWorkspace);
  function field<K extends keyof WorkspaceDraft>(key: K): [WorkspaceDraft[K], (value: SetStateAction<WorkspaceDraft[K]>) => void] {
    return [workspace.value[key], value => workspace.set(current => ({ ...current, [key]: typeof value === "function" ? (value as (v: WorkspaceDraft[K]) => WorkspaceDraft[K])(current[key]) : value }))];
  }
  const [selectedDate] = field("selectedDate");
  const planDate = selectedDate ?? today;
  const execution = useExecution(scope, today || planDate, snapshot, workspace.hydrated && planLoad.ok);
  function startExecutionTask(task: Task) {
    if (!execution.state || execution.state.current || execution.busy || execution.pending) return;
    void execution.command({ type: "start", taskId: task.id });
  }
  const savedTheme = useSyncExternalStore<"light" | "dark">(subscribeTheme, getThemeSnapshot, () => "light");
  const [themeOverride, setThemeOverride] = useState<"light" | "dark" | null>(null);
  const theme = themeOverride ?? savedTheme;
  const [input, setInput] = field("input");
  const classification = defaultClassification;
  const [filter, setFilter] = useState<Filter>("all");
  // Navigation starts at the daily plan; saved workspace content stays intact.
  const [view, setView] = useState<View>("list");
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [rangeDraft, setRange] = field("range");
  const range: RangeScope = rangeDraft ?? "day";
  const planningView = view === "list" || view === "rhythm";
  const week = weekDates(planDate);
  const headerTitle = view === "history" ? viewHeaders.history.title : view === "settings" ? viewHeaders.settings.title : planningView ? "하루계획" : viewHeaders.mandala.title;
  const headerDescription = view === "mandala" ? viewHeaders.mandala.description : planningView ? range === "all" ? "날짜를 정하지 않은 할 일" : range === "week" ? `${week[0] ?? "—"} ~ ${week.at(-1) ?? "—"}` : dayLabel(planDate) : "";
  const selectionMode = true;
  const [sort, setSort] = useState<TaskSort>("manual");
  const [splitting, setSplitting] = useState(false);
  const [bulkRequest, setBulkRequest] = useState<BulkRequest | null>(null);
  const [timeMove, setTimeMove] = useState<TimeMovePreview | null>(null);
  const [timetablePlacement, setTimetablePlacement] = useState<TimetablePlacementPreview | null>(null);
  const [durationChange, setDurationChange] = useState<TaskDurationPreview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string } | null>(null);
  const reminderHandled = useRef(false);
  useEffect(() => {
    if (!workspace.hydrated || reminderHandled.current) return;
    let active = true;
    const navigate = async () => {
      const url = new URL(window.location.href), date = url.searchParams.get("reminder-date");
      if (!date || !isPlanDate(date) || reminderHandled.current) return;
      const { data, error } = await syncClient().auth.getSession();
      // The anonymous SSR workspace must not consume an authenticated account's
      // link or overwrite its draft before account and draft hydration finish.
      if (!active || error || getPlanScope() !== scope || (data.session?.user.id ?? "local") !== scope || reminderHandled.current) return;
      reminderHandled.current = true;
      if (workspace.set(current => ({ ...current, selectedDate: date, range: "day" }))) {
        setView("rhythm");
        url.searchParams.delete("reminder-date"); window.history.replaceState(window.history.state, "", url.href);
      }
    };
    const check = () => { void navigate().catch(() => {}); };
    const unsubscribe = subscribePlan(check); window.addEventListener("focus", check); check();
    return () => { active = false; unsubscribe(); window.removeEventListener("focus", check); };
  }, [workspace, scope]);
  const [editingId, setEditingId] = field("editingId");
  const [replanId, setReplanId] = useState<string | null>(null);
  const [replanDate, setReplanDate] = useState("");
  const [replanError, setReplanError] = useState("");
  const editor = editingId && Object.hasOwn(workspace.value.editors, editingId) ? workspace.value.editors[editingId] : undefined;
  function editField<K extends keyof EditorDraft>(key: K, fallback: EditorDraft[K]): [EditorDraft[K], (value: SetStateAction<EditorDraft[K]>) => void] {
    return [editor?.[key] ?? fallback, value => { workspace.set(current => {
      const id = current.editingId, previous = id && Object.hasOwn(current.editors, id) ? current.editors[id] : undefined;
      if (!id || !previous) return current;
      return { ...current, editors: { ...current.editors, [id]: { ...previous, [key]: typeof value === "function" ? (value as (v: EditorDraft[K]) => EditorDraft[K])(previous[key]) : value } } };
    }); }];
  }
  const [editTitle, setEditTitle] = editField("title", "");
  const [editNotes, setEditNotes] = editField("notes", "");
  const [editDone, setEditDone] = editField("done", false);
  const [editError, setEditError] = useState("");
  const mandala = workspace.value.mandalaDraft ?? safeMandala(plan.mandala);
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  function setSelectedIds(value: SetStateAction<Set<string>>) {
    setSelectionIds(current => {
      const visible = new Set(visibleTasks.map(task => task.id));
      const previous = new Set(current.filter(id => visible.has(id)));
      const next = typeof value === "function" ? value(previous) : value;
      return [...next].filter(id => visible.has(id));
    });
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const replanDialogRef = useRef<HTMLDialogElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editingTask = plan.tasks.find((task) => task.id === editingId);
  const replanTask = plan.tasks.find((task) => task.id === replanId);
  const replanTaskId = replanTask?.id;
  const editingTaskId = editingTask?.id;

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
  const scopedTasks = filterClassifiedTasks(rangeTasks, classification);
  const executionTasks = scopedTasks.filter(task => !task.summaryOnly);
  const active = executionTasks.filter((task) => !task.done);
  const doneCount = executionTasks.length - active.length;
  const day = selectDay(plan.tasks, planDate);
  const availability = plan.availabilityByDate?.[planDate];
  const planningAlerts = usePlanningAlerts(day, availability, planningView && range === "day" && workspace.hydrated, view);
  const planningIssues = new Map(planningAlerts.inspecting ? planningAlerts.report.issues.map(issue => [issue.id, issue]) : []);
  function inspectPlanningIssues(id?: string) {
    planningAlerts.inspect(id); setFilter("all");
    const issue = planningAlerts.report.issues.find(issue => issue.id === id) ?? planningAlerts.report.issues[0];
    changeView(issue?.start === null ? "list" : "rhythm");
  }
  const progress = executionTasks.length ? Math.round(doneCount / executionTasks.length * 100) : 0;
  const visibleTasks = sortTasks(scopedTasks.filter((task) => filter === "all" || (filter === "done" ? task.done && !task.summaryOnly : !task.done && !task.summaryOnly)), sort)
    .sort((a, b) => Number(a.done) - Number(b.done));
  const selectedIds = new Set(selectionIds.filter(id => visibleTasks.some(task => task.id === id)));
  const selectedTasks = selectedVisibleTasks(plan.tasks, [...selectedIds], visibleTasks.map(task => task.id));
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
    setSelectedIds(current => { const next = new Set(current); for (const task of visibleTasks) { if (allSelected) next.delete(task.id); else next.add(task.id); } return next; });
  }

  function save(next: Plan, message: string, markRepeatExceptions = true) {
    if (markRepeatExceptions) next = preserveManualRepeatEdits(plan, next);
    if (!planLoad.ok) { setError(planLoad.error); return false; }
    if (!validPlan(next)) { setError("할 일과 시간 설정을 확인해주세요."); return false; }
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("저장된 계획이 바뀌었어요. 최신 내용을 확인해주세요.");
      if (sameValue(next, plan)) { setError(""); setNotice({ message: "변경된 내용이 없어요." }); return true; }
      writePlan(next);
      setError("");
      setNotice({ message });
      return true;
    } catch (error) {
      setError(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "브라우저에 저장하지 못했어요. 저장 공간이나 사이트 저장 권한을 확인해주세요.");
      return false;
    }
  }

  function addSplitTasks(titles: string[], original?: string): string | null {
    try {
      if (!sameValue(readLatestPlan(), plan)) return "목록이 바뀌었어요. 원문과 나눈 내용을 유지했으니 최신 목록에서 다시 확인해주세요.";
      const next = addTaskCandidates(plan, titles, { date: range === "all" ? null : planDate, categoryId: classification.category.startsWith("category:") ? classification.category.slice(9) : null, tagIds: classification.tags }, () => crypto.randomUUID());
      const prepared = original && original.length > 120 && titles.length === 1 ? { ...next, tasks: next.tasks.map((task, index) => index >= plan.tasks.length ? { ...task, notes: original } : task) } : next;
      if (!save(prepared, `${titles.length}개의 할 일을 추가했어요.`)) return "저장하지 못했어요. 원문과 나눈 내용은 그대로 유지했어요.";
      setInput(""); setFilter("all"); inputRef.current?.focus(); return null;
    } catch (error) { return (error as Error).message; }
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

  function deleteSelected() {
    requestBulk("delete");
  }

  function deleteEditedTask() {
    if (!editingTask || editorConflict) return;
    try {
      const id = editingTask.id;
      setBulkRequest(previewBulkAction(plan, [id], [id], "delete"));
    } catch (error) { setEditError((error as Error).message); }
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
      if (bulkRequest.kind === "delete") workspace.set(current => [...ids].reduce((result, id) => withoutEditor(result, id), current));
      setSelectionIds([]); setBulkRequest(null); return null;
    } catch (error) { return (error as Error).message; }
  }
  function moveTask(task: Task, direction: -1 | 1) {
    if (sort !== "manual") { setError("수동 순서에서만 이동할 수 있어요."); return; }
    try { save(moveVisibleTask(plan, visibleTasks.map(task => task.id), task.id, direction), "보이는 할 일의 수동 순서를 바꿨어요."); } catch (error) { setError((error as Error).message); }
  }

  function dropTask(source: string, target: string) {
    if (sort !== "manual" || source === target) return;
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("계획이 바뀌었어요. 최신 목록에서 다시 옮겨주세요.");
      save(dropVisibleTask(plan, visibleTasks.map(task => task.id), source, target), "수동 순서를 바꿨어요.");
    } catch (error) { setError((error as Error).message); }
  }
  function placeListedTask(id: string, date: string, time: string) {
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("계획이 바뀌었어요. 최신 목록에서 다시 배치해주세요.");
      const task = plan.tasks.find(task => task.id === id);
      const preview = previewTimetablePlacement(plan, id, date, time, task && !hasTaskTime(task) ? { minutes: 30, bufferMinutes: 5 } : undefined);
      if (sameValue(preview.before, preview.after)) return;
      if (!hasTaskTime(preview.before) || preview.warnings.length) setTimetablePlacement(preview);
      else { const problem = confirmTimetablePlacement(preview); if (problem) setError(problem); }
    } catch (error) { setError((error as Error).message); }
  }
  function confirmTimetablePlacement(preview: TimetablePlacementPreview) {
    try {
      const next = applyTimetablePlacement(readLatestPlan(), preview);
      if (!save(next, "시간표에 배치했어요.")) return "저장하지 못했어요. 입력은 유지했어요. 저장 공간과 최신 계획을 확인해주세요.";
      setSelectionIds([]);
      workspace.set(current => ({ ...current, selectedDate: preview.after.plannedDate, range: "day" }));
      setTimetablePlacement(null); return null;
    } catch (error) { return (error as Error).message; }
  }
  function refreshTimetablePlacement(date: string, time: string, duration?: TimetablePlacementDuration) {
    if (!timetablePlacement) return "배치할 할 일을 다시 선택해주세요.";
    try { setTimetablePlacement(previewTimetablePlacement(readLatestPlan(), timetablePlacement.before.id, date, time, duration)); return null; }
    catch (error) { return (error as Error).message; }
  }
  function moveTimelineTask(task: Task, delta: number, days = 0) {
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("계획이 바뀌었어요. 최신 시간표에서 다시 옮겨주세요.");
      const next = shiftStart(task.plannedDate!, task.startTime!, delta + days * 1440);
      const preview = previewTimeMove(plan, task.id, next.date, next.time);
      if (preview.warnings.length) setTimeMove(preview);
      else { const message = confirmTimeMove(preview); if (message) setError(message); }
    } catch (error) { setError((error as Error).message); }
  }
  function confirmTimeMove(preview: TimeMovePreview) {
    try {
      const next = applyTimeMove(readLatestPlan(), preview);
      if (!save(next, "시간을 옮겼어요. 소요시간과 목표 연결은 유지했어요.")) return "저장하지 못했어요. 입력은 유지했어요. 최신 계획과 저장 공간을 확인해주세요.";
      setTimeMove(null); return null;
    } catch (error) { return (error as Error).message; }
  }
  function refreshTimeMove(date: string, time: string) {
    if (!timeMove) return "이동할 할 일을 다시 선택해주세요.";
    try { setTimeMove(previewTimeMove(readLatestPlan(), timeMove.before.id, date, time)); return null; }
    catch (error) { return (error as Error).message; }
  }

  function resizeTimelineTask(task: Task, minutes: number) {
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("계획이 바뀌었어요. 최신 시간표에서 다시 조절해주세요.");
      const preview = previewTaskDuration(plan, task.id, minutes);
      if (preview.warnings.length) setDurationChange(preview);
      else { const message = confirmTaskDuration(preview); if (message) setError(message); }
    } catch (error) { setError((error as Error).message); }
  }
  function confirmTaskDuration(preview: TaskDurationPreview) {
    try {
      const next = applyTaskDuration(readLatestPlan(), preview);
      if (!save(next, "소요시간을 바꿨어요. 시작 시각과 여유시간은 유지했어요.")) return "저장하지 못했어요. 최신 계획과 저장 공간을 확인해주세요.";
      setDurationChange(null); return null;
    } catch (error) { return (error as Error).message; }
  }
  function refreshTaskDuration() {
    if (!durationChange) return "조절할 할 일을 다시 선택해주세요.";
    try { setDurationChange(previewTaskDuration(readLatestPlan(), durationChange.before.id, durationChange.after.minutes!)); return null; }
    catch (error) { return (error as Error).message; }
  }

  function changeFilter(value: Filter) {
    setSelectedIds(new Set());
    changeView("list");
    setFilter(value);
  }

  function changeView(value: View) {
    setSelectionIds([]);
    if (value === "rhythm") setRange("day");
    setView(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function navigateRange(value: RangeScope) {
    setSelectionIds([]);
    workspace.set(current => ({ ...current, range: value, selectedDate: value === "all" ? current.selectedDate : koreanToday() }));
    setView("list");
    setFilter("all"); setError("");
  }

  function editorFrom(task: Task): EditorDraft {
    return { base: task, baseMandala: safeMandala(plan.mandala), baseGoalTree: plan.goalTree, goalLinks: taskGoalIds(plan.goalTree, task.id), repeat: initialRepeatDraft(task, plan), reminder: task.reminderMinutes == null ? "" : String(task.reminderMinutes), title: task.title, notes: task.notes ?? "", importance: task.importance ?? "normal", dueDate: task.dueDate ?? "", dueTime: task.dueTime ?? "", categoryId: task.categoryId ?? null, tagIds: task.tagIds ?? [], work: workFromStoredTime(task.minutes, task.bufferMinutes), buffer: task.bufferMinutes === null ? "" : String(task.bufferMinutes), start: task.startTime ?? "", date: task.plannedDate ?? "", timeMode: task.startTime || task.minutes === null ? "clock" : "duration", end: task.endTime ?? "", endDate: task.endDate ?? task.plannedDate ?? "", endDay: String(task.endDayOffset ?? 0), priority: task.priority, done: task.done, links: mandala.areas.flatMap((area, a) => area.taskIds.flatMap((id, c) => id === task.id ? [a + ":" + c] : [])) };
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
  const editorConflict = Boolean(editor && editingTask && !sameValue(taskToV4(editor.base), editingTask));

  function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask || !editor) return;
    try {
      if (!sameValue(readLatestPlan(), plan)) throw new Error("저장된 계획이 갱신됐어요. 최신 내용을 확인한 뒤 저장해주세요.");
      if (editorConflict) throw new Error("저장된 할 일이 바뀌었어요. 아래에서 사용할 내용을 선택해주세요.");
      const next = updateSimpleTask(plan, editingTask.id, { ...editor, title: editTitle, notes: editNotes, done: editDone, schedule: { start: editor.start, date: editor.date } });
      if (save(next, "내용을 수정했어요.")) workspace.set(current => withoutEditor(current, editingTask.id));
      else setEditError("저장하지 못했어요. 브라우저의 저장 공간이나 사이트 저장 권한을 확인해주세요.");
    } catch (error) { setEditError((error as Error).message); }
  }

  if (!planLoad.ok) return <main className="oddk-page oddk-recovery font-sans" data-theme={theme}><section className="oddk-recoveryCard" role="alert"><h1>저장된 내용을 복구해야 해요</h1><p>{planLoad.error}</p><p>원본은 바꾸지 않았어요. 먼저 백업을 받고 최근 정상 저장본을 복구해보세요. 정상 저장본이 없으면 백업 파일을 보관한 채 데이터 형식 확인이 필요해요.</p><div className="oddk-recoveryActions"><button type="button" onClick={() => exportPlanBackup(EMPTY_SNAPSHOT)}>원본 백업 받기</button><button type="button" onClick={() => { try { restoreLastValidPlan(); } catch (error) { setError((error as Error).message); } }}>최근 정상 저장본 복구</button></div>{error && <p role="status">{error}</p>}</section></main>;

  return (
    <div className="oddk-page font-sans" data-theme={theme}>

      <div className="oddk-window">
        <div className="oddk-windowBody">
          <aside className="oddk-sidebar">
            <Link href="/" className="oddk-brand" aria-label="oddk 홈으로"><Image src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`} alt="oddk" width={1952} height={800} className="oddk-logo" priority /></Link>
            <nav className="oddk-navigation" aria-label="계획 탐색">
              <button type="button" aria-current={planningView ? "page" : undefined} onClick={() => navigateRange("day")}><HiOutlineSun aria-hidden="true" /><span>하루계획</span></button>
              <button type="button" aria-current={view === "mandala" ? "page" : undefined} onClick={() => changeView("mandala")}><HiOutlineSquares2X2 aria-hidden="true" /><span>목표추적</span></button>
              <div className="oddk-navigationGroup">
                <button type="button" aria-expanded={dashboardOpen} aria-controls="dashboard-menu" onClick={() => setDashboardOpen(open => !open)}><HiOutlineChartBar aria-hidden="true" /><span>대시보드</span><HiOutlineChevronDown className="oddk-navigationChevron" aria-hidden="true" /></button>
                <div id="dashboard-menu" hidden={!dashboardOpen}><button type="button" aria-current={view === "history" ? "page" : undefined} onClick={() => changeView("history")}><span>작업이력</span></button></div>
              </div>
              <button type="button" aria-current={view === "settings" ? "page" : undefined} onClick={() => changeView("settings")}><HiOutlineCog6Tooth aria-hidden="true" /><span>환경설정</span></button>
            </nav>
            <SyncPanel fallback={EMPTY_SNAPSHOT} />
          </aside>

          <main className="oddk-workspace" aria-labelledby="workspace-title">
            <WorkspaceHeader title={headerTitle} description={headerDescription} actions={<button type="button" className="oddk-themeToggle" onClick={toggleTheme} aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"} title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}><HiOutlineSun aria-hidden="true" /></button>} />
            <div className="oddk-pageBody">
              {planningView && range === "day" && isPlanDate(planDate) && <ActivityHours key={planDate} date={planDate} saved={availability} onSave={(value, expected) => {
                const latest = readLatestPlan();
                if (!sameValue(latest.availabilityByDate?.[planDate], expected)) return false;
                return save({ ...latest, availabilityByDate: { ...latest.availabilityByDate, [planDate]: value } }, "활동 시간을 저장했어요.");
              }} />}
            {planningView && range === "day" && <PlanningAlert model={planningAlerts} onInspect={inspectPlanningIssues} />}
            <RepeatMaintenance plan={plan} today={today} from={planningView && range !== "all" && isPlanDate(planDate) ? range === "week" ? week[0] : planDate : undefined} through={planningView && range !== "all" && isPlanDate(planDate) ? range === "week" ? week.at(-1) : planDate : undefined} />
            {view !== "list" && <DraftFeedback draft={workspace} />}
      {Object.entries(workspace.value.editors).filter(([id]) => !plan.tasks.some(t => t.id === id)).map(([id, draft]) => <section className="oddk-draftRecovery" key={id}><strong>삭제된 할 일의 초안</strong><p>{draft.title}</p><button type="button" onClick={() => { setInput(draft.title); changeView("list"); }}>추가 입력란으로 복사</button><button type="button" onClick={() => workspace.set(current => withoutEditor(current, id))}>이 초안 폐기</button><button type="button" onClick={workspace.download}>초안 백업 받기</button></section>)}


                <section hidden={!planningView} className="oddk-composer" aria-label="할 일 작성">
                <p id="todo-add-target" className={"oddk-addTarget" + (range === "day" && classification.category === "all" && !classification.tags.length ? " oddk-srOnly" : "")}>{range === "all" ? "날짜 없이 추가" : isPlanDate(planDate) ? `${dayLabel(planDate)}에 추가` : "계획 날짜를 선택해주세요"}{classification.category.startsWith("category:") && ` · ${plan.categories?.find(c => `category:${c.id}` === classification.category)?.name ?? "삭제된 카테고리"}`}{classification.tags.length > 0 && ` · ${classification.tags.map(id => "#" + (plan.tags?.find(t => t.id === id)?.name ?? "삭제된 태그")).join(" ")}`}</p>
                <TaskSplitAction key={scope + ":" + planDate + ":" + view} source={input} disabled={!today} onAdd={addSplitTasks} onBusyChange={setSplitting} onSourceSnapshot={setInput}>
                  <div className="oddk-entryField">
                  <AutoTextarea ref={inputRef} id="todo-input" aria-label="할 일 입력" disabled={!today || splitting} value={input} onChange={(event) => { setInput(event.target.value); setError(""); }} aria-describedby="todo-input-count todo-add-target todo-entry-guide" onLimit={() => setError("원문은 2000자까지 입력할 수 있어요. 입력은 유지했으니 조금 나눠 적어주세요.")}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} title="Enter로 추가, Shift+Enter로 줄바꿈"
                    rows={4} maxLength={2000} placeholder={today ? "" : "저장된 할 일을 불러오고 있어요"} autoComplete="off" />
                  <div id="todo-entry-guide" className="oddk-entryGuide" hidden={Boolean(input) || !today}>
                    할 일을 자유롭게 적어보세요.<br />여러 할 일을 한 문장이나 여러 줄로 적어도 돼요.
                    <p><em>Enter로 추가 · Shift+Enter로 줄바꿈</em></p>
                  </div>
                  </div>
                </TaskSplitAction>


                {workspace.problem && <DraftFeedback draft={workspace} />}
                </section>
            {planningView && range === "day" && <div className="oddk-paneSwitch" role="group" aria-label="하루 보기"><button type="button" aria-pressed={view === "rhythm"} onClick={() => changeView("rhythm")}><HiOutlineClock />시간표</button><button type="button" aria-pressed={view !== "rhythm"} onClick={() => changeView("list")}><HiOutlineListBullet />목록</button></div>}
            {view === "history" && <ExecutionHistoryPage scope={scope} today={today} revision={execution.state?.revision} />}
            <div id="planning-issues-targets" hidden={view === "settings" || view === "history"} className={"oddk-contentGrid oddk-singleView" + (planningView && range === "day" ? " oddk-dailyGrid" : "")} data-pane={view === "rhythm" ? "rhythm" : "list"}>
              <aside hidden={!planningView || range !== "day"} className="oddk-rhythm" aria-labelledby="rhythm-title">
                <WeeklyTimetable key={planDate + ":" + planningAlerts.focusRequest} plan={plan} tasks={filterClassifiedTasks(plan.tasks, classification)} date={planDate} today={today}
                  highlightedIssues={planningAlerts.inspecting ? planningAlerts.report.issues : []} focusTaskId={planningAlerts.focusTaskId}
                  onSelectDate={date => { setSelectionIds([]); workspace.set(current => ({ ...current, selectedDate: date, range: "day" })); }}
                  onEdit={openEditor} onMove={moveTimelineTask} onResize={resizeTimelineTask} onPlace={placeListedTask} newTaskContext={{ categoryId: classification.category.startsWith("category:") ? classification.category.slice(9) : null, tagIds: classification.tags }} onCreate={preview => {
                    try {
                      const next = applyNewTimetableTask(readLatestPlan(), preview);
                      if (!save(next, "할 일을 추가했어요.")) return "저장하지 못했어요. 입력을 확인하고 다시 시도해주세요.";
                      setSelectionIds([]); setFilter("all");
                      workspace.set(current => ({ ...current, selectedDate: preview.task.plannedDate, range: "day" }));
                      return null;
                    } catch (error) { return (error as Error).message; }
                  }} />
              </aside>
              <section hidden={!planningView} className="oddk-taskArea" aria-labelledby="task-list-title">
                <div className="oddk-sectionHeading">
                  <h2 id="task-list-title" className="oddk-srOnly">할 일 리스트</h2>
                  <div className="oddk-listTabs" role="group" aria-label="할 일 상태">
                    <button type="button" aria-pressed={filter === "all"} onClick={() => changeFilter("all")}>전체<span>{scopedTasks.length}</span></button>
                    <button type="button" aria-pressed={filter === "active"} onClick={() => changeFilter("active")}>진행 중<span>{active.length}</span></button>
                    <button type="button" aria-pressed={filter === "done"} onClick={() => changeFilter("done")}>완료<span>{doneCount}</span></button>
                  </div>
                  <PlanningIssuesButton model={planningAlerts} onInspect={inspectPlanningIssues} />
                  <details className="oddk-startSort">
                    <summary aria-label="목록 정렬" title="목록 정렬" data-active={sort !== "manual"}><HiOutlineFunnel aria-hidden="true" /><span className="oddk-srOnly">목록 정렬</span></summary>
                    <div className="oddk-startSortOptions" role="group" aria-label="목록 정렬 방식">
                      {([["manual", "수동 순서"], ["importance", "중요도 높은 순"], ["importance-low", "중요도 낮은 순"], ["start-asc", "시작시간 오름차순"], ["start-desc", "시작시간 내림차순"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={sort === value} onClick={event => { setSort(value); const menu = event.currentTarget.closest("details"); if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); } }}>{label}</button>)}
                    </div>
                  </details>
                </div>


                {selectionMode && <div className="oddk-selectionBar">
                  <SelectionCheckbox label="현재 목록 전체 선택" checked={allSelected} disabled={visibleTasks.length === 0} mixed={selectedTasks.length > 0 && !allSelected} onChange={toggleSelectAll} />
                  <button type="button" disabled={visibleTasks.length === 0} onClick={toggleSelectAll}>전체 선택</button>

<section className="oddk-selectionDock" aria-label="선택한 할 일 작업"><div className="oddk-bulkActions"><button type="button" disabled={selectedTasks.length !== 1} onClick={() => openEditor(selectedTasks[0])}>수정</button><button type="button" disabled={!selectedTasks.length} onClick={completeSelected}><HiOutlineCheck aria-hidden="true" />{allSelectedDone ? "완료 취소" : "완료"}</button><button type="button" disabled={!selectedTasks.length} onClick={deleteSelected}><HiOutlineTrash aria-hidden="true" />삭제</button><button type="button" disabled={!selectedIds.size} onClick={() => setSelectedIds(new Set())}><HiOutlineXMark aria-hidden="true" />선택 해제</button></div></section>
                </div>}


                {error && <p className="oddk-error" role="alert">{error}</p>}
                {execution.message === "수행 기록을 저장했어요." && <p className="oddk-executionSaved" role="status">수행 기록을 저장했어요.</p>}

                {visibleTasks.length === 0 ? <div className="oddk-empty">
                  <HiOutlineClipboardDocumentCheck aria-hidden="true" />
                  {(classification.category !== "all" || classification.tags.length > 0 || classification.search) ? <><h3>필터에 맞는 할 일이 없어요</h3><p>다른 분류·태그·검색어를 선택하거나 필터를 초기화해보세요.</p><button type="button" onClick={() => {}}>필터 초기화</button></> : <><h3>{filter === "done" ? "작은 완료가 쌓일 자리예요" : filter === "active" && doneCount > 0 ? "모든 할 일을 마쳤어요!" : "아직 비어 있는 하루예요"}</h3>
                  <p>{filter === "done" ? "끝낸 일을 체크하면 여기에 보여요." : filter === "active" && doneCount > 0 ? "필요할 때 다음 할 일을 더해보세요." : "첫 번째 할 일을 가볍게 적어보세요."}</p></>}
                </div> : <ul className="oddk-taskList">
                  {visibleTasks.map((task) => { return <TaskRow key={task.id} id={task.id} title={task.title} movable={sort === "manual"} selected={selectionMode ? selectedIds.has(task.id) : undefined} onDrop={target => dropTask(task.id, target)} onReceive={source => dropTask(source, task.id)} onMove={direction => moveTask(task, direction)} onSelect={selectionMode ? () => toggleSelection(task.id) : undefined} onSchedule={planningView && range === "day" && !task.done && !task.summaryOnly ? (date, time) => placeListedTask(task.id, date, time) : undefined} className={"oddk-task" + (task.done ? " oddk-completed" : "") + (selectionMode && selectedIds.has(task.id) ? " oddk-selected" : "") + (planningIssues.has(task.id) ? " oddk-planningProblem" : "")}>
                    <span className="oddk-rowGrip" data-manual={sort === "manual"} aria-hidden="true"><HiOutlineBars3 /></span>
                    <button type="button" className="oddk-taskContent" aria-label={task.title + (selectionMode ? " 선택" : " 상세 수정")} aria-describedby={planningIssues.has(task.id) ? "planning-task-" + task.id : undefined} aria-pressed={selectionMode ? selectedIds.has(task.id) : undefined} onClick={() => selectionMode ? toggleSelection(task.id) : openEditor(task)}>
                      <span className="oddk-taskTitle" title={task.title}>{task.title}</span>
                      <span className="oddk-listTags">
                        <span className="oddk-listTag" data-importance={taskImportance(task)}>중요도 {{ high: "높음", normal: "보통", low: "낮음" }[taskImportance(task)]}</span>
                        <span className="oddk-listTagDivider" aria-hidden="true">|</span>
                        <span className="oddk-listTag" data-status={task.summaryOnly ? "summary" : task.done ? "done" : "active"}>{task.summaryOnly ? "요약" : task.done ? "완료" : "진행 중"}</span>
                        <span className="oddk-listSchedule">
                          <span>{task.plannedDate ?? "날짜 미정"}</span>
                          <span className="oddk-listTagDivider" aria-hidden="true">|</span>
                          <span>{taskTimeLabel(task)}</span>
                        </span>
                        {Boolean(task.tagIds?.length) && <ClassificationBadges task={task} plan={plan} showCategory={false} />}
                      </span>
                      <PlanningIssueBadge issue={planningIssues.get(task.id)} id={"planning-task-" + task.id} />
                    </button>


                    <TaskExecutionControl task={task} currentTaskId={execution.state?.current?.taskId} records={execution.history?.records ?? []} date={today}
                      disabled={!workspace.hydrated || !planLoad.ok || !execution.state || execution.busy || Boolean(execution.pending)} onStart={startExecutionTask} />
                    {!task.done && today && task.plannedDate && task.plannedDate < today && <button type="button" className="oddk-replanButton" aria-label={task.title + " 다시 계획"} onClick={() => { setReplanDate(koreanToday()); setReplanError(""); setReplanId(task.id); }}><HiOutlineArrowUturnLeft aria-hidden="true" />다시 계획</button>}
                  </TaskRow>; })}
                </ul>}

                <div className="oddk-dayProgress">
                  <div><span>{executionTasks.length}개 중 {doneCount}개 완료</span><strong>{progress}%</strong></div>
                  <progress aria-label="현재 범위의 할 일 완료율" max={100} value={progress} />
                </div>
              </section>

              <div hidden={view !== "mandala"}>
                <GoalTreeView plan={plan} onEdit={openEditor} onSave={(tree, expected) => {
                  if (!sameValue(expected, plan.goalTree)) { setError("목표가 바뀌었어요. 최신 내용과 초안을 확인해주세요."); return false; }
                  try { return save(saveGoalTree(plan, tree), "목표를 저장했어요."); } catch (error) { setError((error as Error).message); return false; }
                }} />
              </div>
            </div>
            <section className="oddk-settings" hidden={view !== "settings"} aria-label="환경설정">
              <SettingsPanel plan={plan} onSave={save} theme={theme} onThemeChange={next => { if (next !== theme) toggleTheme(); }} fallback={EMPTY_SNAPSHOT} />
            </section>
            </div>
          </main>
        </div>
      </div>
      <ExecutionPanel compact docked scope={scope} plan={plan} date={today} model={execution} switchTask={null} onCancelSwitch={() => {}} />
      <dialog ref={dialogRef} className="oddk-dialog oddk-taskEditor" aria-labelledby="edit-dialog-title" onKeyDown={keepFocusInDialog} onClose={() => { setEditingId(null); setEditError(""); }}
        onClick={(event) => { if (event.target === event.currentTarget) setEditingId(null); }}>
        {editingTask && <form onSubmit={updateTask} className="oddk-dialogForm">
          <DialogHeader id="edit-dialog-title" title="할 일 수정" closeLabel="수정 창 닫기" onClose={() => setEditingId(null)} />
          <div className="oddk-dialogBody">
          <label className="oddk-dialogField oddk-editorTitle" htmlFor="edit-title">할 일<AutoTextarea ref={editInputRef} id="edit-title" aria-label="할 일" value={editTitle} maxLength={120} required aria-describedby="edit-title-count" onLimit={() => setEditError("제목은120자까지 입력할 수 있어요. 기존 입력은 유지했어요.")}
            onChange={(event) => { setEditTitle(event.target.value); setEditError(""); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} autoFocus /><small id="edit-title-count">{editTitle.length}/120</small></label>
          <label className="oddk-dialogField oddk-editorNotes" htmlFor="edit-notes">상세 메모<AutoTextarea id="edit-notes" aria-label="상세 메모" aria-describedby="edit-notes-count" onLimit={() => setEditError("상세 메모는2000자까지 입력할 수 있어요. 기존 메모는 유지했어요.")} value={editNotes ?? ""} maxLength={2000} placeholder="단계, 준비물, 참고할 내용을 자유롭게 적어보세요." onChange={event => { setEditNotes(event.target.value); setEditError(""); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><small id="edit-notes-count">{(editNotes ?? "").length}/2000</small></label>
          {editor && <TaskTagEditor key={editingTask.id} plan={plan} draft={editor} onChange={patchEditor} />}
          <TaskImportanceFields importance={editor?.importance ?? editingTask.importance ?? "normal"} onChange={patchEditor} />
          <label className="oddk-dialogField oddk-editorStatus" htmlFor="edit-status">상태
            <span className="oddk-editorSelect"><select id="edit-status" disabled={editingTask.summaryOnly} value={editDone ? "done" : "active"} onChange={event => setEditDone(event.target.value === "done")}>
              <option value="active">진행 중</option><option value="done">완료</option>
            </select><HiOutlineChevronDown aria-hidden="true" /></span>
          </label>
          <section className="oddk-simpleTime" aria-labelledby="edit-duration-title"><h3 id="edit-duration-title">시간 설정 <small>소요시간</small></h3>
            {editor && <><TaskTimeFields work={editor.work} buffer={editor.buffer} onWorkChange={work => patchEditor({ work, ...(!work.trim() ? { buffer: "", start: "" } : {}) })} onBufferChange={buffer => patchEditor({ buffer })} /><TaskStartFields draft={editor} needsDate={!editingTask.plannedDate} onChange={patchEditor} /></>}
          </section>
          </div>
          {workspace.problem && <DraftFeedback draft={workspace} />}
          {editorConflict && <section className="oddk-draftConflict" role="alert"><strong>저장된 할 일이 바뀌었어요. 초안은 그대로 있어요.</strong><p>저장본: {editingTask?.title} / 내 초안: {editTitle}</p><p>저장된 메모: {editingTask?.notes || "없음"}<br />내 메모: {editNotes || "없음"}</p><button type="button" onClick={() => { workspace.download(); if (editingTask) workspace.set(current => ({ ...current, editors: { ...current.editors, [editingTask.id]: editorFrom(editingTask) } })); }}>초안 백업 후 저장본 사용</button><button type="button" onClick={() => { workspace.download(); if (editingTask && editingId) workspace.set(current => ({ ...current, editors: { ...current.editors, [editingId]: { ...current.editors[editingId], base: editingTask, baseMandala: safeMandala(plan.mandala), baseGoalTree: plan.goalTree } } })); }}>백업 후 내 초안으로 계속 편집</button></section>}
          {editError && <p role="alert" className="oddk-dialogError">{editError}</p>}
          <div className="oddk-dialogActions">
            <button type="button" className="oddk-dialogDelete" disabled={editorConflict} onClick={deleteEditedTask}>삭제</button>
            <button type="button" className="oddk-dialogCancel" onClick={discardEditor}>취소</button>
            <button type="submit" className="oddk-primary">저장</button>
          </div>
        </form>}
      </dialog>
      <dialog ref={replanDialogRef} className="oddk-dialog oddk-replanDialog" aria-labelledby="replan-title" onKeyDown={keepFocusInDialog} onClose={() => { setReplanId(null); setReplanError(""); }} onClick={(event) => { if (event.target === event.currentTarget) setReplanId(null); }}>
        {replanTask && <form className="oddk-dialogForm" onSubmit={submitReplan}><header className="oddk-dialogHeader"><h2 id="replan-title">다시 계획하기</h2><button type="button" aria-label="다시 계획 창 닫기" onClick={() => setReplanId(null)}><HiOutlineXMark /></button></header><strong>{replanTask.title}</strong><p>기존 날짜 {replanTask.plannedDate}</p><label className="oddk-dialogField" htmlFor="replan-date">새 계획 날짜<input id="replan-date" type="date" min="0001-01-01" max="9999-12-31" required value={replanDate} onChange={(event) => { setReplanDate(event.target.value); setReplanError(""); }} /></label><p>시작 시간은 비우고, 할 일의 내용·시간·목표 연결은 그대로 유지해요.</p>{replanError && <p role="alert" className="oddk-dialogError">{replanError}</p>}<div className="oddk-dialogActions"><button type="button" onClick={() => setReplanId(null)}>취소</button><button type="submit" className="oddk-primary">날짜 옮기기</button></div></form>}
      </dialog>
      {bulkRequest && <BulkActionDialog request={bulkRequest} onCancel={() => setBulkRequest(null)} onConfirm={confirmBulk} />}
      {timeMove && <TimeMoveDialog initial={timeMove} stale={!sameValue(timeMove.expected, plan)} onCancel={() => setTimeMove(null)} onApply={confirmTimeMove} onRefresh={refreshTimeMove} />}
      {timetablePlacement && <TimetablePlacementDialog initial={timetablePlacement} stale={!sameValue(timetablePlacement.expected, plan)} onCancel={() => setTimetablePlacement(null)} onApply={confirmTimetablePlacement} onRefresh={refreshTimetablePlacement} />}
      {durationChange && <TaskDurationDialog preview={durationChange} stale={!sameValue(durationChange.expected, plan)} onCancel={() => setDurationChange(null)} onApply={confirmTaskDuration} onRefresh={refreshTaskDuration} />}
      <div className="oddk-srOnly" role="status" aria-live="polite" aria-atomic="true">{notice?.message}</div>
    </div>
  );
}
