// Emits only synthetic JSON and a read-only parity query, never auth fixtures.
import { writeFileSync, mkdirSync } from "node:fs";
import { startExecution, transitionExecution, expireExecution, manualExecution, validExecutionRecord } from "../supabase/functions/_shared/execution.ts";
const id = "00000000-0000-4000-8000-000000000001", now = "2026-10-29T00:00:00.000Z";
const at = minutes => new Date(Date.parse(now) + minutes * 60000).toISOString();
const task = { id: "synthetic-shape", title: "Synthetic title", plannedDate: "2026-10-29", minutes: 30, bufferMinutes: 5, done: false };
const open = startExecution(task, id, now), closed = transitionExecution(open, "stop", at(10));
const values = [null, [], {}, open, closed, transitionExecution(open, "pause", at(5)), expireExecution(open, at(1500)),
  manualExecution({ ...task, done: true }, id, [{ kind: "work", start: now, end: at(2) }, { kind: "break", start: at(3), end: at(5) }], at(10)),
  { ...closed, owner: "extra" }, { ...closed, schemaVersion: 2 }, { ...closed, id: "bad" }, { ...closed, taskId: "" },
  { ...closed, taskId: "😀".repeat(501) }, { ...closed, title: "😀".repeat(60) }, { ...closed, title: "😀".repeat(61) },
  ...["", " ", "\t\n", "\u00a0", "\ufeff", "\u3000", "\u0085"].map(title => ({ ...closed, title })),
  ...["2026-02-29", "2024-02-29", "0001-01-01", "0000-01-01", null].map(plannedDate => ({ ...closed, plannedDate })),
  { ...closed, plannedWorkMinutes: 30 }, { ...closed, plannedWorkMinutes: 25.5 }, { ...closed, plannedWorkMinutes: null, plannedTotalMinutes: null },
  { ...closed, startedAt: "2026-02-30T00:00:00.000Z" }, { ...closed, startedAt: "2026-10-29T09:00:00.000+09:00" },
  { ...closed, endedAt: at(-1) }, { ...closed, endedAt: at(1441) }, { ...closed, needsReview: true },
  { ...closed, finishReason: "limit", needsReview: true }, { ...closed, finishReason: "unknown" }, { ...open, finishReason: "user" },
  { ...closed, segments: [] }, { ...closed, segments: [{ kind: "work", start: now, end: at(6) }, { kind: "break", start: at(5), end: at(10) }] },
  { ...open, segments: [{ kind: "work", start: now, end: null }, { kind: "work", start: at(1), end: null }] },
  { ...closed, segments: [{ kind: "work", start: now, end: null }] }, { ...closed, segments: [{ kind: "work", start: now, end: at(10), extra: true }] },
  { ...closed, segments: Array.from({ length: 65 }, () => ({ kind: "work", start: now, end: now })) },
];
const corpus = values.map((data, index) => ({ index, data, expected: validExecutionRecord(data) }));
const literal = JSON.stringify(corpus).replaceAll("'", "''");
const query = `with inputs as (select value as item from jsonb_array_elements('${literal}'::jsonb)), results as (select (item->>'index')::int as case_id,(item->>'expected')::boolean as expected,public.execution_record_valid(item->'data') as actual from inputs) select count(*) as cases,count(*) filter(where expected is distinct from actual) as mismatches,coalesce(jsonb_agg(case_id) filter(where expected is distinct from actual),'[]'::jsonb) as failed_cases from results;`;
mkdirSync(new URL("../.sync-test-runtime/", import.meta.url), { recursive: true });
writeFileSync(new URL("../.sync-test-runtime/execution-shapes.sql", import.meta.url), query);
console.log(`Prepared ${corpus.length} synthetic Node/SQL shape cases; no credentials or user data.`);
