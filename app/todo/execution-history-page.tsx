"use client";
import { useState } from "react";
import { isPlanDate } from "../../supabase/functions/_shared/plan";
import { useDatedExecutionHistory } from "./use-execution-history";
import { finishedExecutionSummary } from "./execution-history";
import { formatExecutionClock } from "./execution-timer";

const clock = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));

export function ExecutionHistoryPage({ scope, today, revision }: { scope: string; today: string; revision: number | undefined }) {
  const [selectedDate, setDate] = useState(today);
  const date = selectedDate || today;
  const { history, loading, error, load } = useDatedExecutionHistory(scope, date, revision);
  const records = history?.records.filter(record => record.endedAt !== null) ?? [];
  return <section className="oddk-historyPage" aria-label="작업이력">
    <div className="oddk-historyToolbar"><label htmlFor="history-date">조회 날짜<input id="history-date" type="date" min="0001-01-01" max="9999-12-31" value={date} onChange={event => { if (isPlanDate(event.target.value)) setDate(event.target.value); }} /></label><button type="button" onClick={() => setDate(today)}>오늘</button><button type="button" disabled={loading} onClick={() => void load()}>새로고침</button></div>
    <p className="oddk-historyScope">종료한 수행 기록 · 작업·휴식 시간은 조회 날짜 기준</p>
    {error && <p role="alert" className="oddk-error">{error}</p>}
    {loading && <p role="status">기록을 불러오고 있어요.</p>}
    {!loading && !error && !records.length && <p className="oddk-historyEmpty">이 날짜의 수행 기록이 없어요.</p>}
    {records.length > 0 && <table className="oddk-historyTable" aria-busy={loading}>
      <caption className="oddk-srOnly">{date} 수행 기록</caption>
      <thead><tr><th scope="col">할 일</th><th scope="col">시작</th><th scope="col">종료</th><th scope="col">작업시간</th><th scope="col">휴식시간</th></tr></thead>
      <tbody>{records.map(record => { const totals = finishedExecutionSummary(record, date)!; return <tr key={record.id}><td data-label="할 일">{record.title}</td><td data-label="시작">{clock(record.startedAt)}</td><td data-label="종료">{clock(record.endedAt!)}</td><td data-label="작업시간">{formatExecutionClock(totals.workMs)}</td><td data-label="휴식시간">{formatExecutionClock(totals.breakMs)}</td></tr>; })}</tbody>
    </table>}
    {history?.cursor && <button type="button" className="oddk-historyMore" disabled={loading} onClick={() => void load(history.cursor)}>이전 기록 더 보기</button>}
  </section>;
}
