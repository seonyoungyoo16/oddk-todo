"use client";
import { useEffect, useRef, useState } from "react";
import { HiOutlineMapPin, HiOutlinePlus, HiOutlineArrowUp, HiOutlineArrowDown, HiOutlineTrash } from "react-icons/hi2";
import type { Plan } from "../../supabase/functions/_shared/plan";
import type { TravelMode, TravelPlace } from "../../supabase/functions/_shared/travel-query";
import { routeKey } from "../../supabase/functions/_shared/travel-query";
import { useLocalDraft, DraftFeedback } from "./use-local-draft";
import { validTravelDraft, createTravelPreview, manualTravelLegKey } from "./travel-core";
import type { TravelDraft, TravelPreview, TravelStop } from "./travel-core";
import { travelPreviewWarnings } from "./travel-warnings";
import { lookupTravel } from "./travel-client";
import { sameValue } from "./json-equality";
import "./travel.css";
const validDraft = (v: unknown): v is TravelDraft | null => v === null || validTravelDraft(v);
const modeLabels = { car: "자동차", foot: "도보", bike: "자전거" };
const newStop = (): TravelStop => ({ id: crypto.randomUUID(), query: "", place: null, stay: "", manualTravel: "" });
type Props = { date: string; plan: Plan; onApply: (preview: TravelPreview, draft: TravelDraft, expected: Plan) => boolean };
export function TravelPlanner({ date, plan, onApply }: Props) {
  const local = useLocalDraft<TravelDraft | null>("travel", null, validDraft), draft = local.value;
  const [candidates, setCandidates] = useState<Record<string, TravelPlace[]>>({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ proposal: TravelPreview; base: Plan } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const currentDraft = useRef(draft);
  useEffect(() => { currentDraft.current = draft; }, [draft]);
  useEffect(() => () => controller.current?.abort(), []);
  const applied = Boolean(draft && plan.tasks.some(task => task.id.startsWith(`travel:${draft.id}:`) || task.id.startsWith(`visit:${draft.id}:`)));
  const stale = Boolean(preview && (!sameValue(preview.base, plan) || !sameValue(preview.proposal.draft, draft)));
  const warnings = preview ? travelPreviewWarnings(plan, preview.proposal.tasks) : [];
  function change(next: TravelDraft) { local.set(next); setMessage(""); }
  function patchStop(id: string, patch: Partial<TravelStop>) { if (draft) change({ ...draft, stops: draft.stops.map(stop => stop.id === id ? { ...stop, ...patch } : stop) }); }
  function begin() { local.set({ id: crypto.randomUUID(), date, departure: "", mode: "car", buffer: "", stops: [newStop(), newStop()], result: null }); setPreview(null); setCandidates({}); setMessage(""); }
  async function search(index: number) {
    if (!draft) return;
    const stop = draft.stops[index]; setBusy(true); setMessage("");
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await lookupTravel({ action: "search", query: stop.query }, abort.signal);
      if (result.action !== "search") throw new Error("장소 후보를 다시 조회해주세요.");
      if (abort.signal.aborted) return;
      if (currentDraft.current?.id !== draft.id || currentDraft.current.stops.find(item => item.id === stop.id)?.query !== stop.query) { setMessage("조회 중 검색어가 바뀌었어요. 현재 입력으로 다시 검색해주세요."); return; }
      setCandidates(current => ({ ...current, [stop.id]: result.places }));
      setMessage(result.places.length ? `장소 후보 ${result.places.length}개예요. 지역을 확인하고 직접 선택해주세요.${result.cached ? " 저장된 조회 결과예요." : ""}` : "검색 결과가 없어요. 더 자세히 검색하거나 장소 이름과 이동 시간을 직접 입력해주세요.");
    } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "장소를 조회하지 못했어요. 입력은 유지했어요."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function queryRoute() {
    if (!draft || draft.stops.some(stop => !stop.place)) { setMessage("경로를 조회하려면 각 장소의 검색 결과를 선택해주세요. 직접 입력으로도 계속할 수 있어요."); return; }
    const points = draft.stops.map(stop => ({ lon: stop.place!.lon, lat: stop.place!.lat })), expected = routeKey(draft.mode, points);
    setBusy(true); setMessage(""); const abort = new AbortController(); controller.current = abort;
    try {
      const result = await lookupTravel({ action: "route", mode: draft.mode, points }, abort.signal);
      if (result.action !== "route") throw new Error("경로를 다시 조회해주세요.");
      let retained = false;
      local.set(current => { if (!current || current.stops.some(stop => !stop.place) || routeKey(current.mode, current.stops.map(stop => stop.place!)) !== expected) return current; retained = true; return { ...current, result: result.result }; });
      setMessage(retained ? `이동 시간 조회 완료${result.cached ? " · 저장된 조회 결과" : ""}. 직접 정한 이동 시간은 유지했어요. 체류와 여유를 확인한 뒤 미리보세요.` : "조회 중 조건이 바뀌었어요. 입력은 유지했으니 다시 조회해주세요.");
    } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "경로를 조회하지 못했어요. 구간별 이동 시간을 직접 입력해주세요."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  function showPreview() { if (!draft) return; try { setPreview({ proposal: createTravelPreview(draft), base: plan }); setMessage(""); } catch (error) { setMessage((error as Error).message); } }
  function move(index: number, offset: number) { if (!draft) return; const stops = [...draft.stops]; [stops[index], stops[index + offset]] = [stops[index + offset], stops[index]]; change({ ...draft, stops }); }
  const result = draft?.result && draft.stops.every(stop => stop.place) && draft.result.key === routeKey(draft.mode, draft.stops.map(stop => stop.place!)) ? draft.result : null;
  return <details className="oddk-travel"><summary><HiOutlineMapPin aria-hidden="true" />여행 이동 계획 <small>조회하고 확인한 뒤 일정에 추가</small></summary>
    <p>방문할 장소와 순서를 정하면 이동 시간을 조회해요. 체류 시간은 직접 정해주세요.</p>
    <p className="oddk-travelSource">장소 검색어는 <a href="https://github.com/komoot/photon#demo-server" target="_blank" rel="noreferrer">Photon</a>, 선택 좌표는 <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS</a>로 전송돼요. 공개된 장소 이름으로 검색해주세요. 실시간 교통·출발 시각별 혼잡은 반영하지 않아요.</p>
    {!draft ? <button type="button" onClick={begin}>이동 계획 작성</button> : <>
      <DraftFeedback draft={local} />
      <fieldset disabled={busy} className="oddk-travelInputs"><legend>여행 조건</legend><div className="oddk-travelFields">
        <label>여행 날짜<input type="date" min="0001-01-01" max="9999-12-31" value={draft.date} onChange={event => change({ ...draft, date: event.target.value })} /></label>
        <label>출발 시각<input type="time" value={draft.departure} onChange={event => change({ ...draft, departure: event.target.value })} /></label>
        <label>이동 수단<select value={draft.mode} onChange={event => change({ ...draft, mode: event.target.value as TravelMode })}>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>각 일정에 포함할 여유 (분)<input type="number" min={1} max={239} step={1} placeholder="예: 10" value={draft.buffer} onChange={event => change({ ...draft, buffer: event.target.value })} /></label>
      </div>
      <ol className="oddk-travelStops">{draft.stops.map((stop, index) => <li key={stop.id}>
        <div className="oddk-travelStopHeading"><strong>{index === 0 ? "출발 장소" : `방문 ${index}`}</strong><div><button type="button" disabled={index === 0} aria-label={`장소 ${index + 1} 위로`} onClick={() => move(index, -1)}><HiOutlineArrowUp aria-hidden="true" /></button><button type="button" disabled={index === draft.stops.length - 1} aria-label={`장소 ${index + 1} 아래로`} onClick={() => move(index, 1)}><HiOutlineArrowDown aria-hidden="true" /></button><button type="button" disabled={draft.stops.length <= 2} aria-label={`장소 ${index + 1} 삭제`} onClick={() => change({ ...draft, stops: draft.stops.filter(item => item.id !== stop.id) })}><HiOutlineTrash aria-hidden="true" /></button></div></div>
        <div className="oddk-travelSearch"><label htmlFor={`travel-place-${stop.id}`}>장소 {index + 1}<input id={`travel-place-${stop.id}`} maxLength={120} value={stop.query} placeholder="도시와 장소 이름" onChange={event => { patchStop(stop.id, { query: event.target.value, place: null }); setCandidates(current => ({ ...current, [stop.id]: [] })); }} /></label><button type="button" disabled={stop.query.trim().length < 2} onClick={() => search(index)}>장소 {index + 1} 검색</button></div>
        {stop.place ? <p className="oddk-travelSelected">선택한 장소: {stop.place.label}</p> : <p className="oddk-travelHint">후보를 선택하거나 이름과 구간별 이동 시간을 직접 입력해요.</p>}
        {candidates[stop.id]?.length > 0 && <ul className="oddk-placeCandidates" aria-label={`장소 ${index + 1} 검색 결과`}>{candidates[stop.id].map(place => <li key={place.id}><button type="button" onClick={() => { patchStop(stop.id, { place, query: place.name }); setCandidates(current => ({ ...current, [stop.id]: [] })); }}>{place.label}</button></li>)}</ul>}
        {index > 0 && <div className="oddk-travelFields"><label>방문 {index} 체류 (여유 포함, 분)<input type="number" min={0} max={240} step={1} value={stop.stay} placeholder="방문 없이 이동만 하면 0" onChange={event => patchStop(stop.id, { stay: event.target.value })} /></label><label>구간 {index} 이동 직접 입력 (분)<input type="number" min={1} max={239} step={1} value={stop.manualTravel} placeholder={result ? `조회 ${Math.ceil(result.legs[index - 1].seconds / 60)}분 · 비우면 조회값 사용` : "조회 실패 시 직접 입력"} onChange={event => patchStop(stop.id, { manualTravel: event.target.value, manualLegKey: manualTravelLegKey(draft, index) })} /></label>
          {stop.manualTravel && stop.manualLegKey !== undefined && stop.manualLegKey !== manualTravelLegKey(draft, index) && <p role="alert">경로가 바뀌었어요. 직접 정한 {stop.manualTravel}분을 확인해주세요. <button type="button" onClick={() => patchStop(stop.id, { manualLegKey: manualTravelLegKey(draft, index) })}>현재 구간에 이 시간 사용</button></p>}
          {result && <p>구간 {index} 조회 이동 {Math.ceil(result.legs[index - 1].seconds / 60)}분 · {(result.legs[index - 1].meters / 1000).toFixed(1)}km{stop.manualTravel ? ` · 직접 입력 ${stop.manualTravel}분 사용` : ""}</p>}
        </div>}
      </li>)}</ol>
      <div className="oddk-travelActions"><button type="button" disabled={draft.stops.length >= 6} onClick={() => change({ ...draft, stops: [...draft.stops, newStop()] })}><HiOutlinePlus aria-hidden="true" />방문 장소 추가</button><button type="button" disabled={draft.stops.some(stop => !stop.place)} onClick={queryRoute}>이동 시간 조회</button><button type="button" onClick={showPreview}>시간표 미리보기</button></div>
      {result && <p className="oddk-travelSource">출처 OSRM/FOSSGIS · {modeLabels[result.mode]} · 조회 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(result.queriedAt))} (한국 시간). 이동 분은 올림해요.</p>}
      </fieldset>
      {preview && <section className="oddk-travelPreview" aria-label="여행 시간표 미리보기"><h2>확인 후 일정에 추가</h2><p>{preview.proposal.tasks.length}개 일정 · 작업 {preview.proposal.work}분 + 여유 {preview.proposal.buffer}분 · 종료 {preview.proposal.endDate} {preview.proposal.endTime}</p><ol>{preview.proposal.tasks.map(task => <li key={task.id}><time>{task.plannedDate} {task.startTime} ~ {task.endDate} {task.endTime}</time><strong>{task.title}</strong><span>작업 {task.minutes! - task.bufferMinutes!} + 여유 {task.bufferMinutes} = 총 {task.minutes}분</span></li>)}</ol>
        {warnings.length > 0 && <details open><summary>시간 확인 {warnings.length}건</summary><ul>{warnings.map(text => <li key={text}>{text}</li>)}</ul></details>}
        {stale && <p role="alert">입력이나 저장된 계획이 바뀌었어요. 다시 미리 본 뒤 반영해주세요.</p>}
        <div className="oddk-travelActions"><button type="button" onClick={() => setPreview(null)}>미리보기 닫기</button><button type="button" disabled={stale || applied || busy} onClick={() => { try { if (onApply(preview.proposal, draft, preview.base)) { setPreview(null); setMessage("일정에 추가했어요. 목록에서 수정하거나 최근 변경 되돌리기로 복구할 수 있어요."); } else setMessage("반영하지 못했어요. 입력과 미리보기는 유지했으니 저장 상태를 확인해주세요."); } catch (error) { setMessage((error as Error).message); } }}>{applied ? "이미 반영한 계획" : `${preview.proposal.tasks.length}개 일정에 추가`}</button></div>
      </section>}
      {applied && <p>이미 반영한 여행이에요. 수정은 할 일 목록에서 해주세요.</p>}
      <button type="button" disabled={busy} onClick={() => { local.download(); begin(); }}>초안 백업 후 새 여행 계획</button>
    </>}
    {busy && <p role="status">조회 중이에요. 입력은 보관돼요.</p>}{message && <p role="status">{message}</p>}
    <p className="oddk-travelSource">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap 기여자</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">지도 오류 수정</a> · 공개 시제품은 조회가 제한될 수 있어요.</p>
  </details>;
}
