"use client";
import { useEffect, useState } from "react";
import type { DayPlan } from "./day-selectors";
import type { Availability } from "../../supabase/functions/_shared/schedule";
import { planningAlertReport, validPlanningDismissals, dismissPlanningAlert } from "./planning-alert-model";
import { useLocalDraft } from "./use-local-draft";

export function usePlanningAlerts(day: DayPlan, availability: Availability | undefined, enabled: boolean, pane: string) {
  const dismissals = useLocalDraft<string[]>("planning-alert-dismissals", [], validPlanningDismissals);
  const report = planningAlertReport(day, availability);
  const [inspection, setInspection] = useState<{ key: string; taskId: string; request: number } | null>(null);
  const inspecting = enabled && report.issues.length > 0 && inspection?.key === report.key;
  const date = day.date;
  useEffect(() => {
    if (!inspecting || !inspection) return;
    const root = document.getElementById("planning-issues-targets");
    if (!root) return;
    const frame = requestAnimationFrame(() => {
      const shown = (element: HTMLElement | undefined) => element?.getClientRects().length ? element : undefined;
      const row = shown([...root.querySelectorAll<HTMLElement>("[data-order-task]")].find(element => element.dataset.orderTask === inspection.taskId));
      const tile = shown([...root.querySelectorAll<HTMLElement>("[data-planning-task]")].find(element => element.dataset.planningTask === inspection.taskId && element.dataset.planningDate === date));
      const target = pane === "rhythm" ? tile ?? row : row ?? tile;
      target?.scrollIntoView({ block: "center", inline: "nearest" });
      target?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [inspecting, inspection, pane, date]);
  return { report, inspecting, focusTaskId: inspecting ? inspection!.taskId : undefined,
    ready: enabled && dismissals.hydrated,
    focusRequest: inspecting ? inspection!.request : 0,
    visible: enabled && dismissals.hydrated && report.issues.length > 0 && !dismissals.value.includes(report.key),
    storageProblem: dismissals.problem, retrySave: dismissals.retry,
    inspect: (taskId?: string) => {
      const task = report.issues.find(task => task.id === taskId) ?? report.issues[0];
      if (task) setInspection(current => ({ key: report.key, taskId: task.id, request: (current?.request ?? 0) + 1 }));
    },
    clear: () => setInspection(null),
    dismiss: () => { dismissals.set(keys => dismissPlanningAlert(keys, report.key)); setInspection(null); },
  };
}
export type PlanningAlertsController = ReturnType<typeof usePlanningAlerts>;
