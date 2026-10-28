"use client";
import { useEffect, useState } from "react";
import type { Plan } from "../../supabase/functions/_shared/plan";
import { isPlanDate } from "../../supabase/functions/_shared/calendar";
import { prepareRepeatWindow } from "../../supabase/functions/_shared/repeat-window";
import { loadPlan } from "../../supabase/functions/_shared/plan-migration";
import { sameValue } from "./json-equality";
import { getPlanScope, getPlanSnapshot, writePlan } from "./sync-store";

export function RepeatMaintenance({ plan, today, from, through }: { plan: Plan; today: string; from?: string; through?: string }) {
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!plan.recurrences?.length || !isPlanDate(today)) return;
    let scope: string | null = null;
    try { scope = getPlanScope(); } catch { /* Report storage failure inside the scheduled job. */ }
    const job = window.setTimeout(() => {
      try {
        if (scope === null) throw new Error("저장 공간이나 사이트 저장 권한을 확인해주세요.");
        if (scope !== getPlanScope()) return;
        const latest = loadPlan(getPlanSnapshot(JSON.stringify(plan)));
        if (!latest.ok || !sameValue(latest.plan, plan)) return;
        const next = prepareRepeatWindow(plan, today, from && through ? { from, through } : undefined);
        if (next !== plan) writePlan(next);
        setProblem("");
      } catch (error) { setProblem(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "저장 공간이나 사이트 저장 권한을 확인한 뒤 다시 시도해주세요."); }
    }, 0);
    return () => window.clearTimeout(job);
  }, [plan, today, from, through, attempt]);
  if (!plan.recurrences?.length || !problem) return null;
  return <section className="oddk-repeatConfirm" role="alert"><p>반복 일정을 준비하지 못했어요. 기존 계획과 입력은 유지했어요.</p><p>{problem}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>반복 일정 다시 준비</button></section>;
}
