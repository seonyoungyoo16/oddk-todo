import test from "node:test";
import assert from "node:assert/strict";
import { planningAlertReport, validPlanningDismissals, dismissPlanningAlert } from "../../app/todo/planning-alert-model.ts";
import { selectDay } from "../../app/todo/day-selectors.ts";
import { draftKey, saveDraft, decodeDraft } from "../../app/todo/draft-store.ts";
import { activityHoursValue } from "../../app/todo/activity-hours-model.ts";
import { previewReplan } from "../../supabase/functions/_shared/replan.ts";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration.ts";
import { travelPreviewWarnings } from "../../app/todo/travel-warnings.ts";

const date = "2026-10-31", window = { start: "09:00", end: "18:00", fixed: [] };
const task = (id, startTime, minutes = 30, patch = {}) => ({ id, title: id, plannedDate: date, startTime, minutes, bufferMinutes: 5, done: false, priority: "normal", ...patch });
const report = (tasks, availability = window, day = date) => planningAlertReport(selectDay(tasks, day), availability);

test("activity hours remain unset until explicit valid input and preserve fixed blocks", () => {
  assert.equal(activityHoursValue("", "").value, null);
  assert.equal(activityHoursValue("09:00", "").value, null);
  assert.equal(activityHoursValue("09:00", "08:00").value, null);
  const fixed = [{ id: "lunch", title: "점심", start: "12:00", end: "13:00" }], before = JSON.stringify(fixed);
  assert.deepEqual(activityHoursValue("09:00", "18:00", fixed).value, { ...window, fixed });
  assert.equal(JSON.stringify(fixed), before);
  assert.equal(activityHoursValue("23:00", "00:00").value.end, "24:00");
});
test("without configured hours, early/late tasks and estimates never get activity-window warnings", () => {
  const tasks = [task("early", "01:00"), task("late", "23:00"), task("a", null, 220), task("b", null, 220), task("c", null, 220)];
  const result = planningAlertReport(selectDay(tasks, date), undefined);
  assert.equal(result.window, "미설정"); assert.equal(result.outsideCount, 0); assert.equal(result.excessMinutes, 0); assert.deepEqual(result.issues, []);
  const overlapping = planningAlertReport(selectDay([task("one", "01:00"), task("two", "01:15")], date), undefined);
  assert.equal(overlapping.overlapCount, 2);
  assert.deepEqual(overlapping.issues[0].reasons, ["다른 일정과 겹침"]);
});
test("placement warnings and automatic replanning never invent an unconfigured activity window", () => {
  const loaded = loadPlan(JSON.stringify({ tasks: [], start: "09:00", review: "" }));
  assert.equal(loaded.ok, true);
  const source = { ...loaded.plan, availabilityByDate: {} }, before = JSON.stringify(source), early = task("early", "01:00");
  assert.deepEqual(travelPreviewWarnings(source, [early]), []);
  assert.throws(() => previewReplan(source, { date, baseMinute: 0, pinnedIds: [] }), /활동 시간을 먼저/);
  assert.equal(JSON.stringify(source), before);
  assert.ok(travelPreviewWarnings({ ...source, availabilityByDate: { [date]: window } }, [early]).some(message => message.includes("활동 시간 밖")));
});

test("outside-window diagnostics include exact times, omit healthy boundaries and preserve task data", () => {
  const tasks = [task("early", "08:45"), task("opening", "09:00"), task("closing", "17:30"), task("late", "17:45")];
  const before = JSON.stringify(tasks), result = report(tasks);
  assert.equal(result.outsideCount, 2);
  assert.deepEqual(result.issues.map(issue => [issue.id, issue.time, issue.reasons]), [["early", "08:45–09:15", ["활동 시간 밖", "다른 일정과 겹침"]], ["opening", "09:00–09:30", ["다른 일정과 겹침"]], ["closing", "17:30–18:00", ["다른 일정과 겹침"]], ["late", "17:45–18:15", ["활동 시간 밖", "다른 일정과 겹침"]]]);
  assert.equal(JSON.stringify(tasks), before);
  assert.deepEqual(report([task("open", "09:00"), task("close", "17:30")]).issues, []);
});
test("multiple warning reasons share one task identity and include fixed-time conflicts", () => {
  const result = report([task("early", "08:45"), task("second", "09:00")], { ...window, fixed: [{ id: "meeting", title: "회의", start: "09:10", end: "09:20" }] });
  assert.equal(result.issues.length, 2); assert.equal(result.outsideCount, 1); assert.equal(result.overlapCount, 2);
  assert.deepEqual(result.issues[0].reasons, ["활동 시간 밖", "다른 일정과 겹침", "고정·휴식과 겹침"]);
});
test("dismissal identity ignores ordering, names and unrelated healthy changes, but detects changed problems", () => {
  const a = task("early", "08:00"), b = task("healthy", "12:00");
  const key = report([a, b]).key;
  assert.equal(report([{ ...b, startTime: "14:00" }, { ...a, title: "이름 변경", importance: "high" }, task("other", "16:00")]).key, key);
  assert.notEqual(report([{ ...a, startTime: "07:00" }, b]).key, key);
  assert.notEqual(report([a, b], { ...window, start: "10:00" }).key, key);
  assert.notEqual(report([{ ...a, plannedDate: "2026-11-01" }], window, "2026-11-01").key, key);
});
test("completed and summary tasks cannot remain highlighted, while overnight slices use the selected date", () => {
  assert.deepEqual(report([task("done", "08:00", 30, { done: true }), task("summary", "07:00", 30, { summaryOnly: true })]).issues, []);
  const overnight = report([task("overnight", "23:30", 120, { plannedDate: "2026-10-30" })]);
  assert.deepEqual(overnight.issues.map(issue => [issue.id, issue.time, issue.start, issue.end]), [["overnight", "00:00–01:30", 0, 90]]);
});
test("capacity-only warnings identify unplaced estimates without inventing a timetable position", () => {
  const result = report([task("estimate-a", null, 220), task("estimate-b", null, 220), task("estimate-c", null, 220)]);
  assert.equal(result.excessMinutes, 120); assert.equal(result.issues[0].start, null);
  assert.equal(result.issues[0].time, "시각 미설정");
  assert.equal(report([task("estimate-a", null, 180), task("estimate-b", null, 180), task("estimate-c", null, 180)]).key, "");
});
test("closed warning survives persisted draft readback and stays isolated from another account", () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const key = report([task("early", "08:00")]).key, slot = "planning-alert-dismissals";
  saveDraft(storage, "local", slot, dismissPlanningAlert([], key), validPlanningDismissals);
  assert.deepEqual(decodeDraft(storage.getItem(draftKey("local", slot)), validPlanningDismissals).data, [key]);
  assert.equal(storage.getItem(draftKey("another-account", slot)), null);
  assert.deepEqual(dismissPlanningAlert([key], key), [key]);
  assert.equal(validPlanningDismissals([key, key]), false);
  assert.equal(validPlanningDismissals(["2026-02-30:0000000000000000"]), false);
  assert.equal(validPlanningDismissals(["bad"]), false);
  let keys = [];
  for (let index = 0; index < 110; index++) keys = dismissPlanningAlert(keys, `${date}:${index.toString(16).padStart(16, "0")}`);
  assert.equal(keys.length, 100); assert.equal(validPlanningDismissals(keys), true);
});
