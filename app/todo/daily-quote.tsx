"use client";

import { useEffect, useState } from "react";
import { HiOutlineArrowUpRight } from "react-icons/hi2";
import { ADVICE_SOURCE, browserAdviceStorage, loadDailyAdvice, readAdviceCache, validAdviceDate } from "./daily-advice";
import type { CachedAdvice } from "./daily-advice";
import "./daily-quote.css";

export function DailyQuote({ date, hidden = false }: { date: string; hidden?: boolean }) {
  if (hidden || !validAdviceDate(date)) return null;
  return <DailyAdviceCard key={date} date={date} />;
}

function DailyAdviceCard({ date }: { date: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ entry: CachedAdvice | null; status: "loading" | "ready" | "error"; persisted: boolean }>({ entry: null, status: "loading", persisted: true });
  useEffect(() => {
    let active = true;
    loadDailyAdvice(date).then(result => {
      if (active) setState({ entry: result, status: "ready", persisted: result.persisted });
    }).catch(() => {
      if (!active) return;
      const previous = readAdviceCache(browserAdviceStorage);
      setState({ entry: previous && previous.date <= date ? previous : null, status: "error", persisted: true });
    });
    return () => { active = false; };
  }, [date, attempt]);
  const entry = state.entry;
  const displayedDate = entry?.date ?? date;

  return (
    <aside className="oddk-dailyQuote" aria-labelledby="daily-quote-title">
      <div className="oddk-dailyQuoteHeading">
        <h2 id="daily-quote-title">{entry && entry.date !== date ? "마지막으로 받은 명언" : "오늘의 명언"}</h2>
        <time dateTime={displayedDate}>{Number(displayedDate.slice(5, 7))}월 {Number(displayedDate.slice(8))}일</time>
      </div>
      {entry && <figure>
        <blockquote cite={ADVICE_SOURCE}><p>{entry.advice.message}</p></blockquote>
        <figcaption>
          <span className="oddk-dailyQuoteAuthor">{entry.advice.author}{entry.advice.authorProfile && <span> · {entry.advice.authorProfile}</span>}</span>
          <a href={ADVICE_SOURCE} target="_blank" rel="noreferrer noopener" aria-label="명언 제공: 한국어 명언 API (새 창)">
            한국어 명언 API
            <HiOutlineArrowUpRight aria-hidden="true" />
          </a>
        </figcaption>
      </figure>}
      {state.status === "loading" && <p className="oddk-dailyQuoteStatus" role="status">오늘의 명언을 불러오고 있어요.</p>}
      {state.status === "error" && <div className="oddk-dailyQuoteStatus" role="status">
        <p>{entry ? "오늘 명언을 불러오지 못해 이전 문장을 보여드려요." : "명언을 불러오지 못했어요."}</p>
        <button type="button" onClick={() => { setState(current => ({ ...current, status: "loading" })); setAttempt(value => value + 1); }}>다시 불러오기</button>
      </div>}
      {state.status === "ready" && !state.persisted && <p className="oddk-dailyQuoteStatus" role="status">이 기기에 저장하지 못해 새로고침하면 문장이 바뀔 수 있어요.</p>}
    </aside>
  );
}
