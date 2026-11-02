import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { koreanToday } from "../../app/todo/plan-date.ts";
import { dayLabel, shiftDate } from "../../app/todo/calendar-range.ts";
import { clockLabel } from "../../app/todo/timeline.ts";
import * as model from "../../app/todo/weekly-timetable-model.ts";
import { shiftStart, previewTimeMove, applyTimeMove } from "../../app/todo/task-movement.ts";

const task = (id, date, startTime, patch = {}) => ({ id, title: id, notes: "preserved memo", plannedDate: date, startTime,
  endDate: date, endTime: "10:00", endDayOffset: 0, minutes: 60, bufferMinutes: 10, done: false, priority: "high", importance: "normal", ...patch });
function plan() {
  return { schemaVersion: 5, tasks: [
    task("carry", "2026-11-03", "23:40", { endDate: "2026-11-04", endTime: "00:40", endDayOffset: 1 }),
    task("today", "2026-11-04", "09:00"), task("tomorrow", "2026-11-05", "09:00"),
  ], start: "09:00", reviewsByDate: {}, goalTree: { goal: "preserved goal", groups: [{ id: "g", title: "group", taskIds: ["carry"] }] } };
}

test("native daily view includes the midnight slice and leaves every source record intact; web keeps seven days", () => {
  const original = plan(), before = JSON.stringify(original);
  const daily = model.buildTimetableDays(original, "2026-11-04", original.tasks, true);
  assert.deepEqual(daily.map(day => day.date), ["2026-11-04"]);
  assert.deepEqual(daily[0].tasks.map(task => task.id).sort(), ["carry", "today"]);
  const carry = daily[0].tasks.find(task => task.id === "carry");
  assert.equal(carry.continuesBefore, true); assert.equal(carry.segmentMinutes, 40);
  assert.equal(model.buildTimetableDays(original, "2026-11-04").length, 7);
  assert.equal(JSON.stringify(original), before);
});

test("a native carry-over drag starts on the displayed day while preserving identity, duration, notes and goal links", () => {
  const original = plan(), before = JSON.stringify(original), carry = original.tasks[0];
  const delta = model.todayTimetableMoveDelta(carry, "2026-11-04", 0, 15);
  const nextTime = shiftStart(carry.plannedDate, carry.startTime, delta);
  assert.deepEqual(nextTime, { date: "2026-11-04", time: "00:15" });
  const next = applyTimeMove(original, previewTimeMove(original, carry.id, nextTime.date, nextTime.time));
  assert.equal(next.tasks.length, original.tasks.length);
  assert.equal(next.tasks[0].id, carry.id); assert.equal(next.tasks[0].notes, carry.notes);
  assert.equal(next.tasks[0].minutes, 60); assert.equal(next.tasks[0].bufferMinutes, 10);
  assert.deepEqual(next.goalTree, original.goalTree); assert.deepEqual(next.tasks.slice(1), original.tasks.slice(1));
  assert.equal(JSON.stringify(original), before);
});

test("native drag clamps the start inside today instead of offering previous/next-day movement", () => {
  const t = plan().tasks[1];
  for (const [delta, time] of [[-1000, "00:00"], [2000, "23:59"]]) {
    const moved = shiftStart(t.plannedDate, t.startTime, model.todayTimetableMoveDelta(t, t.plannedDate, 540, delta));
    assert.equal(moved.date, t.plannedDate); assert.equal(moved.time, time);
  }
});

const element = (type, props) => ({ type, props });
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
function view(nativeToday = "2026-11-04") {
  const state = [], moves = [], selected = [], exports = {}; let index;
  const Add = () => null, Timeline = () => null;
  const jsx = ts.transpileModule(readFileSync(new URL("../../app/todo/weekly-timetable.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(jsx, { exports, document: { activeElement: null }, require(name) {
    if (name === "react") return { useState(initial) { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; }, useMemo: fn => fn(), useEffect() {}, useRef: () => ({ current: null }) };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element };
    if (name === "react-icons/hi2") return {};
    if (name.includes("_shared/plan")) return { isPlanDate: value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") };
    if (name === "./calendar-range") return { dayLabel, shiftDate };
    if (name === "./timeline") return { clockLabel };
    if (name === "./timeline-task") return { TimelineScroll: () => null, TimelineTask: Timeline };
    if (name === "./weekly-timetable-model") return model;
    if (name === "./timetable-add-dialog") return { TimetableAddDialog: Add };
    if (name === "./timetable-drag") return { timetableTaskDragType: "fixture" };
    if (name === "./timetable-details") return {};
    throw Error(name);
  } });
  const original = plan();
  const props = { plan: original, tasks: original.tasks, date: "2026-11-02", today: "2026-11-04", nativeToday,
    onSelectDate: date => selected.push(date), onMove: (...args) => moves.push(args), onResize() {}, onPlace() {}, onCreate() {} };
  return { moves, selected, Timeline, Add, render(patch = {}) { index = 0; Object.assign(props, patch); return exports.WeeklyTimetable(props); } };
}

test("native today is independent of selected date or screen width and exposes one inert date heading; web navigation remains", () => {
  const native = nodes(view().render());
  assert.equal(native.filter(n => n.props?.className === "oddk-weekColumn").length, 1);
  assert.equal(native.find(n => n.props?.className === "oddk-weekColumn").props["data-date"], "2026-11-04");
  assert.equal(native.filter(n => n.type === "nav").length, 0);
  assert.equal(native.filter(n => n.props?.className === "oddk-weekTodayHeading").length, 1);
  const web = nodes(view("").render());
  assert.equal(web.filter(n => n.props?.className === "oddk-weekColumn").length, 7);
  assert.equal(web.filter(n => n.type === "nav").length, 1);
});

test("blank-slot addition targets today and a midnight view change preserves the open old-date draft", () => {
  const h = view();
  nodes(h.render()).find(n => n.props?.className === "oddk-weekBlank").props.onClick({ detail: 0 });
  let draft = nodes(h.render()).find(n => n.type === h.Add);
  assert.equal(draft.props.date, "2026-11-04"); assert.equal(draft.props.time, "09:00");
  const rolled = nodes(h.render({ nativeToday: "2026-11-05" }));
  draft = rolled.find(n => n.type === h.Add);
  assert.equal(draft.props.date, "2026-11-04", "never silently retarget a pending draft on rollover");
  assert.equal(rolled.find(n => n.props?.className === "oddk-weekColumn").props["data-date"], "2026-11-05");
});

test("native task keyboard day movement is ignored; web continues forwarding its day offset", () => {
  for (const native of [true, false]) {
    const h = view(native ? "2026-11-04" : ""), node = nodes(h.render()).find(n => n.type === h.Timeline);
    node.props.onMove(0, -1);
    assert.equal(h.moves.length, native ? 0 : 1);
    if (!native) assert.equal(h.moves[0][2], -1);
  }
});

function clock(native = true, deferred = false) {
  let now = Date.parse("2026-11-04T14:59:59.999Z"), notified = 0, removed = 0, appCalls = 0, nextId = 0, appCallback, resolveListener;
  const timers = new Map(), focus = new EventTarget(), visible = new EventTarget(), exports = {};
  const source = ts.transpileModule(readFileSync(new URL("../../app/todo/native-timetable-clock.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class ClockDate extends Date { static now() { return now; } }
  const listener = { async remove() { removed++; } };
  vm.runInNewContext(source, { exports, Date: ClockDate, Math, window: focus, document: visible,
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === "@capacitor/core") return { Capacitor: { isNativePlatform: () => native } };
      if (name === "@capacitor/app") return { App: { addListener(_name, cb) { appCalls++; appCallback = cb; return deferred ? new Promise(resolve => { resolveListener = resolve; }) : Promise.resolve(listener); } } };
      if (name === "./plan-date.ts") return { koreanToday: () => koreanToday(new Date(now)) };
      throw Error(name);
    } });
  return { api: exports, timers, focus, visible, get notified() { return notified; }, get removed() { return removed; }, get appCalls() { return appCalls; },
    setNow(value) { now = Date.parse(value); }, subscribe() { return exports.subscribeNativeTimetableDate(() => notified++); }, resume() { appCallback({ isActive: true }); }, resolve() { resolveListener(listener); } };
}

test("native clock advances at Seoul midnight and refreshes after background/foreground with all subscriptions cleaned", async () => {
  const h = clock(), unsubscribe = h.subscribe(); await Promise.resolve();
  assert.equal(h.api.getNativeTimetableDate(), "2026-11-04");
  const timer = [...h.timers.values()][0]; assert.equal(timer.delay, 21);
  h.setNow("2026-11-04T15:00:00.020Z"); timer.fn();
  assert.equal(h.api.getNativeTimetableDate(), "2026-11-05"); assert.equal(h.notified, 1);
  h.setNow("2026-11-06T01:00:00Z"); h.resume(); h.focus.dispatchEvent(new Event("focus")); h.visible.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.api.getNativeTimetableDate(), "2026-11-06"); assert.equal(h.notified, 4);
  unsubscribe(); assert.equal(h.removed, 1);
  const count = h.notified; h.focus.dispatchEvent(new Event("focus")); assert.equal(h.notified, count);
});

test("web opens no native subscription and a late native listener is removed after unmount", async () => {
  const web = clock(false); web.subscribe()();
  assert.equal(web.api.getNativeTimetableDate(), ""); assert.equal(web.appCalls, 0); assert.equal(web.timers.size, 0);
  const native = clock(true, true); native.subscribe()(); native.resolve(); await Promise.resolve();
  assert.equal(native.removed, 1); assert.equal(native.timers.size, 0);
});
