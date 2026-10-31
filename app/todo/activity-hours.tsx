"use client";
import { useRef, useState } from "react";
import type { Availability } from "../../supabase/functions/_shared/schedule";
import { DialogHeader } from "./ui/dialog-header";
import { keepFocusInDialog } from "./dialog-focus";
import { sameValue } from "./json-equality";
import { activityHoursValue } from "./activity-hours-model";

export function ActivityHours({ date, saved, onSave }: { date: string; saved?: Availability; onSave: (value: Availability, expected?: Availability) => boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null), first = useRef<HTMLInputElement>(null);
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [error, setError] = useState("");
  const [base, setBase] = useState<Availability | undefined>(undefined);
  const parsed = activityHoursValue(start, end, saved?.fixed ?? []);
  return <>
    <div className="oddk-activityHoursBar"><span>활동 시간 <strong>{saved ? `${saved.start}–${saved.end}` : "미설정"}</strong></span>
      <button ref={opener} type="button" onClick={() => { setStart(saved?.start ?? ""); setEnd(saved?.end === "24:00" ? "00:00" : saved?.end ?? ""); setBase(saved); setError(""); dialog.current?.showModal(); first.current?.focus(); }}>활동 시간 {saved ? "변경" : "설정"}</button>
    </div>
    <dialog ref={dialog} className="oddk-dialog oddk-activityHoursDialog" aria-labelledby="activity-hours-title" onKeyDown={keepFocusInDialog} onClose={() => opener.current?.focus()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <form className="oddk-dialogForm" onSubmit={event => {
        event.preventDefault();
        if (!sameValue(base, saved)) { setError("다른 화면에서 활동 시간이 바뀌었어요. 창을 다시 열어 저장값을 확인해주세요."); return; }
        if (!parsed.value) { setError(parsed.error); return; }
        try {
          if (onSave(parsed.value, base)) dialog.current?.close();
          else setError("활동 시간을 저장하지 못했어요. 입력을 확인한 뒤 다시 시도해주세요.");
        } catch { setError("저장된 계획이 바뀌었어요. 입력은 유지했으니 현재 설정을 확인해주세요."); }
      }}>
        <DialogHeader id="activity-hours-title" title="활동 시간 설정" closeLabel="활동 시간 설정 닫기" onClose={() => dialog.current?.close()} />
        <p className="oddk-activityHoursDate">{date}에 적용할 시작·종료 시간을 직접 정해주세요.</p>
        <div className="oddk-activityHoursFields">
          <label>활동 시작<input ref={first} type="time" step={60} required value={start} onChange={event => { setStart(event.target.value); setError(""); }} /></label>
          <label>활동 종료<input type="time" step={60} required value={end} onChange={event => { setEnd(event.target.value); setError(""); }} /></label>
        </div>
        {(error || start && end && parsed.error) && <p role="alert" className="oddk-error">{error || parsed.error}</p>}
        <div className="oddk-dialogActions"><button type="button" onClick={() => dialog.current?.close()}>취소</button><button type="submit" className="oddk-primary" disabled={!parsed.value}>저장</button></div>
      </form>
    </dialog>
  </>;
}
