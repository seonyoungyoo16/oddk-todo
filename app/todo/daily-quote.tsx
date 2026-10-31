import { HiOutlineArrowUpRight } from "react-icons/hi2";
import { quoteForDate } from "./daily-quotes";
import "./daily-quote.css";

export function DailyQuote({ date, hidden = false }: { date: string; hidden?: boolean }) {
  const quote = quoteForDate(date);
  if (hidden || !quote) return null;

  return (
    <aside className="oddk-dailyQuote" aria-labelledby="daily-quote-title">
      <div className="oddk-dailyQuoteHeading">
        <h2 id="daily-quote-title">오늘의 개발 명언</h2>
        <time dateTime={date}>{Number(date.slice(5, 7))}월 {Number(date.slice(8))}일</time>
      </div>
      <figure>
        <blockquote cite={quote.sourceUrl}><p>{quote.text}</p></blockquote>
        <figcaption>
          <a href={quote.sourceUrl} target="_blank" rel="noreferrer noopener"
            aria-label={`${quote.author}, ${quote.work}, ${quote.passage} 원문 보기 (새 창)`}>
            {quote.author}<span aria-hidden="true"> · </span><cite>{quote.work}</cite>
            <HiOutlineArrowUpRight aria-hidden="true" />
          </a>
          {quote.translated && <span className="oddk-dailyQuoteTranslation">원문 의역</span>}
        </figcaption>
      </figure>
    </aside>
  );
}
