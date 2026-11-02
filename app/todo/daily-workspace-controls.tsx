import type { Plan } from "../../supabase/functions/_shared/plan";
import { isPlanDate } from "../../supabase/functions/_shared/plan";
import type { RangeScope } from "./calendar-range";
import { dayLabel, weekDates } from "./calendar-range";
import type { ClassificationFilter } from "./classification-actions";
import { ClassificationFilters, defaultClassification } from "./classification-controls";
import { HiOutlineCalendarDays, HiOutlineChevronDown, HiOutlineClock, HiOutlineFunnel, HiOutlineListBullet, HiOutlineXMark } from "react-icons/hi2";

export function DailyDateControl({ date, today, range, onChange, fixed = false }: { date: string; today: string; range: RangeScope; onChange: (date: string, range: RangeScope) => void; fixed?: boolean }) {
  const dates = weekDates(date);
  const short = isPlanDate(date) ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일` : "날짜 선택";
  const weekday = isPlanDate(date) ? ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][new Date(`${date}T12:00:00Z`).getUTCDay()] : "";
  if (fixed) return <div className="oddk-dailyDate oddk-dailyDateFixed" aria-label={`오늘 시간표: ${dayLabel(date)}`}><HiOutlineCalendarDays aria-hidden="true" /><span>{short}<small>{weekday}</small></span></div>;
  return <details className="oddk-dailyDate">
    <summary aria-label={`계획 날짜와 범위 선택: ${range === "all" ? "모든 할 일" : dayLabel(date)}`}><HiOutlineCalendarDays aria-hidden="true" /><span>{range === "all" ? "모든 할 일" : short}<small>{range === "week" ? "이번 주" : range === "all" ? "" : weekday}</small></span><HiOutlineChevronDown aria-hidden="true" /></summary>
    <div className="oddk-workspacePopover oddk-datePopover">
      <label>계획 날짜<input type="date" min="0001-01-01" max="9999-12-31" value={isPlanDate(date) ? date : ""} onChange={event => { if (isPlanDate(event.target.value)) onChange(event.target.value, range); }} /></label>
      <label>목록 범위<select value={range} onChange={event => onChange(date, event.target.value as RangeScope)}><option value="day">선택한 하루</option><option value="week">선택한 주</option><option value="all">모든 할 일</option></select></label>
      {range === "week" && <small>{dates[0]} – {dates.at(-1)}</small>}
      <button type="button" disabled={!isPlanDate(today)} onClick={() => onChange(today, "day")}>오늘</button>
    </div>
  </details>;
}

export function DailyPlanningControls({ plan, value, onChange, count, total, pane, onPaneChange, range }: {
  plan: Plan; value: ClassificationFilter; onChange: (value: ClassificationFilter) => void; count: number; total: number; pane: "list" | "rhythm"; onPaneChange: (value: "list" | "rhythm") => void; range: RangeScope;
}) {
  const detailed = value.category !== "all" || value.tags.length > 0 || value.search !== "";
  const filtered = detailed || (value.status ?? "all") !== "all";
  const category = value.category === "none" ? "미분류" : value.category.startsWith("category:") ? plan.categories?.find(c => `category:${c.id}` === value.category)?.name ?? "삭제된 카테고리" : "";
  return <>
    <div className="oddk-dailyControls">
      {range === "day" ? <div className="oddk-paneSwitch" role="group" aria-label="하루 보기"><button type="button" aria-pressed={pane === "list"} onClick={() => onPaneChange("list")}><HiOutlineListBullet aria-hidden="true" />목록</button><button type="button" aria-pressed={pane === "rhythm"} onClick={() => onPaneChange("rhythm")}><HiOutlineClock aria-hidden="true" />시간표</button></div> : <span className="oddk-rangeLabel">{range === "week" ? "선택한 주의 할 일" : "모든 할 일"}</span>}
      <label className="oddk-commonStatus"><span className="oddk-srOnly">상태</span><select aria-label="할 일 상태" value={value.status ?? "all"} onChange={event => onChange({ ...value, status: event.target.value as ClassificationFilter["status"] })}><option value="all">전체</option><option value="active">진행 중</option><option value="done">완료</option></select></label>
      <details className="oddk-detailedFilters"><summary data-active={detailed}><HiOutlineFunnel aria-hidden="true" />필터{detailed && <span className="oddk-srOnly"> 적용 중</span>}</summary>
        <div className="oddk-workspacePopover oddk-filterPopover"><h2>상세 필터</h2><ClassificationFilters plan={plan} value={value} onChange={onChange} count={count} total={total} showStatus={false} /></div>
      </details>
    </div>
    {filtered && <div className="oddk-appliedFilters"><span role="status">{total}개 중 {count}개{category && ` · ${category}`}{value.tags.map(id => ` · #${plan.tags?.find(tag => tag.id === id)?.name ?? "삭제된 태그"}`).join("")}{value.search && ` · 검색: ${value.search}`}{value.status !== "all" && value.status && ` · ${value.status === "done" ? "완료" : "진행 중"}`}</span><button type="button" onClick={() => onChange(defaultClassification)}><HiOutlineXMark aria-hidden="true" />초기화</button></div>}
  </>;
}
