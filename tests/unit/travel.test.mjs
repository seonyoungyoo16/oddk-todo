import test from "node:test";
import assert from "node:assert/strict";
import { parseTravelQuery, parsePhoton, parseOsrm, routeKey } from "../../supabase/functions/_shared/travel-query.ts";
import { createTravelPreview, applyTravelPreview, validTravelDraft, manualTravelLegKey } from "../../app/todo/travel-core.ts";
import { travelPreviewWarnings } from "../../app/todo/travel-warnings.ts";
import { applyBulkAction, previewBulkAction } from "../../app/todo/bulk-actions.ts";
import { validPlan } from "../../supabase/functions/_shared/plan.ts";
import { makeUndo, applyUndo } from "../../app/todo/plan-history.ts";
const places = [{ id: "N:1", name: "Museum", label: "Museum, Berlin", lon: 13.4, lat: 52.5 }, { id: "N:2", name: "Gate", label: "Gate, Berlin", lon: 13.39, lat: 52.51 }];
const query = { action: "route", mode: "car", points: places };
const estimate = () => parseOsrm({ code: "Ok", routes: [{ legs: [{ duration: 601, distance: 5000 }] }] }, query, "2026-10-28T01:00:00Z");
const draft = () => ({ id: "journey-1", date: "2026-10-28", departure: "09:00", mode: "car", buffer: "10", stops: places.map((place, index) => ({ id: "stop-" + index, query: place.name, place, stay: "60", manualTravel: "" })), result: estimate() });
const plan = () => ({ schemaVersion: 5, tasks: [], start: "09:00", reviewsByDate: {}, goalTree: { goal: "G", groups: [] } });

test("travel query rejects unsupported modes, invalid coordinates and oversized requests before network", () => {
  assert.equal(parseTravelQuery(JSON.stringify({ action: "search", query: " Museum " })).query, "Museum");
  assert.deepEqual(parseTravelQuery(JSON.stringify(query)).points, places.map(({ lon, lat }) => ({ lon, lat })));
  for (const bad of [{ action: "search", query: "a" }, { ...query, mode: "transit" }, { ...query, points: [{ lon: "13", lat: 52 }, places[1]] }, { ...query, points: [{ lon: 181, lat: 0 }, places[1]] }, { ...query, points: Array(7).fill(places[0]) }]) assert.throws(() => parseTravelQuery(JSON.stringify(bad)));
  assert.throws(() => parseTravelQuery("x".repeat(4097)));
});
test("provider parsing exposes candidates without silently picking a place or fabricating missing durations", () => {
  const list = parsePhoton({ features: places.map((p, index) => ({ geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { osm_id: index + 1, osm_type: "N", name: p.name, city: "Berlin" } })) });
  assert.equal(list.length, 2); assert.equal(list[1].name, "Gate");
  assert.equal(estimate().legs[0].seconds, 601);
  for (const value of [{ code: "NoRoute" }, { code: "Ok", routes: [{ legs: [] }] }, { code: "Ok", routes: [{ legs: [{ duration: -1, distance: 5 }] }] }, { code: "Ok", routes: [{ legs: [{ duration: 20, distance: Infinity }] }] }]) assert.throws(() => parseOsrm(value, query, "2026-10-28T01:00:00Z"));
});
test("preview includes travel buffers once, leaves activity time user supplied and never changes plan before apply", () => {
  const input = draft(), before = plan(), raw = JSON.stringify(before), preview = createTravelPreview(input);
  assert.equal(preview.tasks.length, 2); assert.equal(preview.tasks[0].minutes, 21); assert.equal(preview.tasks[0].startTime, "09:00"); assert.equal(preview.tasks[0].endTime, "09:21");
  assert.equal(preview.tasks[1].minutes, 60); assert.equal(preview.endTime, "10:21"); assert.equal(preview.work, 61); assert.equal(preview.buffer, 20);
  assert.equal(JSON.stringify(before), raw);
  const applied = applyTravelPreview(before, preview, input); assert.equal(validPlan(applied), true);
  assert.throws(() => applyTravelPreview(applied, preview, input), /이미 반영/);
  const modified = { ...applied, tasks: applied.tasks.map(task => ({ ...task, title: "Manually edited" })) };
  assert.throws(() => applyTravelPreview(modified, preview, input), /이미 반영/);
  assert.deepEqual(applyUndo(applied, makeUndo(before, applied, "Trip")), before);
});
test("manual travel duration survives requery, stale routes require manual fallback and no stay is invented", () => {
  const input = draft(); input.stops[1].manualTravel = "25";
  assert.equal(createTravelPreview(input).tasks[0].minutes, 35);
  input.result.legs[0].seconds = 300;
  assert.equal(createTravelPreview(input).tasks[0].minutes, 35);
  input.stops[1].manualTravel = ""; input.mode = "foot";
  assert.throws(() => createTravelPreview(input), /직접/);
  input.stops[1].manualTravel = "20"; input.stops[1].stay = "";
  assert.throws(() => createTravelPreview(input), /체류 시간/);
  input.stops[1].stay = "0"; input.stops[1].place = null;
  assert.equal(createTravelPreview(input).tasks.length, 1);
  assert.match(createTravelPreview(input).tasks[0].notes, /위치 미확인/);
  assert.equal(input.result.key, routeKey("car", places));
});
test("preview changes and forged tasks cannot apply, invalid times and calendar overflow keep plan unchanged", () => {
  const before = plan(), input = draft(), preview = createTravelPreview(input);
  assert.throws(() => applyTravelPreview(before, preview, { ...input, departure: "10:00" }), /바뀌/);
  assert.throws(() => applyTravelPreview(before, { ...preview, tasks: [] }, input), /바뀌/);
  for (const change of [{ buffer: "0" }, { buffer: "60" }, { departure: "25:00" }, { date: "2026-02-30" }]) assert.throws(() => createTravelPreview({ ...input, ...change }));
  assert.throws(() => createTravelPreview({ ...input, date: "9999-12-31", departure: "23:59" }), /범위/);
  const crossing = createTravelPreview({ ...input, departure: "23:50" });
  assert.equal(crossing.tasks[0].endDayOffset, 1); assert.equal(crossing.tasks[1].plannedDate, "2026-10-29");
  assert.equal(validTravelDraft({ ...input, stops: [input.stops[0], input.stops[0]] }), false);
  assert.equal(before.tasks.length, 0);
});
test("changing route conditions preserves manual values but requires explicit reconfirmation", () => {
  const input = draft(); input.stops[1].manualTravel = "30"; input.stops[1].manualLegKey = manualTravelLegKey(input, 1);
  input.result.legs[0].seconds = 900;
  assert.equal(createTravelPreview(input).tasks[0].minutes, 40);
  input.mode = "bike";
  assert.throws(() => createTravelPreview(input), /바뀌/);
  assert.equal(input.stops[1].manualTravel, "30");
  input.stops[1].manualLegKey = manualTravelLegKey(input, 1);
  assert.equal(createTravelPreview(input).tasks[0].minutes, 40);
  assert.equal(validTravelDraft({ ...input, mode: ["car"] }), false);
});
test("travel preview warns about all existing tasks and fixed time while excluding completed and summary tasks", () => {
  const preview = createTravelPreview(draft());
  const existing = { ...preview.tasks[0], id: "existing", title: "Hidden category task" };
  const before = { ...plan(), tasks: [existing, { ...existing, id: "done", title: "Done", done: true }, { ...existing, id: "summary", title: "Summary", summaryOnly: true }], availabilityByDate: { "2026-10-28": { start: "09:00", end: "18:00", fixed: [{ id: "break", title: "Break", start: "09:05", end: "09:15" }] } } };
  const warnings = travelPreviewWarnings(before, preview.tasks);
  assert.ok(warnings.some(text => text.includes("Hidden category task")));
  assert.ok(warnings.some(text => text.includes("고정·휴식 Break")));
  assert.ok(!warnings.some(text => /Done|Summary/.test(text)));
  const outside = createTravelPreview({ ...draft(), departure: "08:00" });
  assert.ok(travelPreviewWarnings(before, outside.tasks).some(text => text.includes("활동 시간 밖")));
  assert.equal(before.tasks.length, 3);
});
test("the same itinerary on another date or departure permits completion undo without admitting exact duplicates", () => {
  const input = draft(), first = applyTravelPreview(plan(), createTravelPreview(input), input);
  const tomorrow = { ...input, id: "another-day", date: "2026-10-29" };
  const both = applyTravelPreview(first, createTravelPreview(tomorrow), tomorrow);
  const completed = applyBulkAction(both, previewBulkAction(both, [both.tasks[0].id], [], "done"));
  assert.deepEqual(applyUndo(completed, makeUndo(both, completed, "Complete travel")), both);
  assert.equal(applyBulkAction(completed, previewBulkAction(completed, [completed.tasks[0].id], [], "undone")).tasks[0].done, false);
  const later = { ...input, id: "later-trip", departure: "13:00" };
  assert.equal(applyTravelPreview(both, createTravelPreview(later), later).tasks.length, 6);
  const duplicate = { ...input, id: "duplicate-trip" };
  assert.throws(() => applyTravelPreview(first, createTravelPreview(duplicate), duplicate), /같은 내용/);
  assert.equal(first.tasks.length, 2);
});
