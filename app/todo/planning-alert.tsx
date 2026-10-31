"use client";
import { HiOutlineXMark } from "react-icons/hi2";
import type { PlanningAlertsController } from "./use-planning-alerts";
import type { PlanningIssue } from "./planning-alert-model";

export function PlanningAlert({ model, onInspect }: { model: PlanningAlertsController; onInspect: (id?: string) => void }) {
  const { report } = model;
  return <>
    {model.visible && <div className="oddk-planningAlert" role="status">
      <div className="oddk-planningAlertText">
        {report.outsideCount > 0 && <span>활동 시간({report.window}) 밖 일정 {report.outsideCount}개</span>}
        {report.overlapCount > 0 && <span>겹친 일정 {report.overlapCount}개</span>}
        {report.excessMinutes > 0 && <span>계획이 가용 시간보다 {report.excessMinutes}분 많아요.</span>}
        <button type="button" onClick={() => onInspect()}>{report.issues.some(issue => issue.start !== null) ? "시간표 확인" : "할 일 확인"}</button>
      </div>
      <button type="button" className="oddk-planningAlertClose" aria-label="일정 안내 닫기" onClick={model.dismiss}><HiOutlineXMark aria-hidden="true" /></button>
    </div>}
    {model.storageProblem && <p role="status">닫은 안내를 기기에 저장하지 못했어요. <button type="button" onClick={model.retrySave}>다시 저장</button></p>}
    {model.inspecting && <section className="oddk-planningInspector" aria-label="확인할 일정">
      <header><strong>확인할 일정 {report.issues.length}개 · 활동 시간 {report.window}</strong><button type="button" onClick={model.clear}>강조 해제</button></header>
      <ul>{report.issues.map(issue => <li key={issue.id}>
        <button type="button" onClick={() => onInspect(issue.id)} aria-label={`${issue.title} ${issue.time} 문제 위치 보기`}>{issue.title} <span>{issue.time}</span></button>
        <span>{issue.reasons.join(" · ")}</span>
      </li>)}</ul>
    </section>}
  </>;
}
export function PlanningIssuesButton({ model, onInspect }: { model: PlanningAlertsController; onInspect: () => void }) {
  return model.ready && !model.visible && !model.inspecting && model.report.issues.length > 0 ? <button type="button" className="oddk-planningIssuesButton" onClick={onInspect}>일정 점검 {model.report.issues.length}개</button> : null;
}
export function PlanningIssueBadge({ issue, id }: { issue?: PlanningIssue; id: string }) {
  return issue ? <span id={id} className="oddk-planningIssueBadge">{issue.reasons.join(" · ")} · {issue.time}</span> : null;
}
