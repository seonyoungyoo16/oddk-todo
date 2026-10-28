"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SetStateAction } from "react";
import { decodeDraft, draftKey, saveDraft } from "./draft-store";
import { getPlanScope } from "./sync-store";

const eventName = "oddk-draft-change";
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify); window.addEventListener(eventName, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(eventName, notify); };
}
export function useLocalDraft<T>(slot: string, initial: T, valid: (value: unknown) => value is T) {
  const scope = getSafeScope();
  const key = draftKey(scope, slot);
  const read = useCallback(() => { try { return localStorage.getItem(key); } catch { return "!storage-unavailable"; } }, [key]);
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const [failed, setFailed] = useState<{ key: string; value: T; message: string } | null>(null);
  let value = initial, updatedAt = "", problem = "";
  try { const stored = decodeDraft(raw, valid); if (stored) { value = stored.data; updatedAt = stored.updatedAt; } }
  catch { problem = "초안을 읽지 못했어요. 원문을 보관하고 다시 확인해주세요."; }
  if (failed?.key === key) { value = failed.value; problem = failed.message; }
  const current = useRef(value);
  useEffect(() => { current.current = value; }, [value]);
  function setValue(action: SetStateAction<T>) {
    const next = typeof action === "function" ? (action as (value: T) => T)(current.current) : action;
    current.current = next;
    try {
      saveDraft(localStorage, scope, slot, next, valid);
      setFailed(null); window.dispatchEvent(new Event(eventName));
      return true;
    } catch {
      setFailed({ key, value: next, message: "초안을 기기에 저장하지 못했어요. 입력은 화면에 남아 있어요. 내용을 보관하고 재시도해주세요." });
      return false;
    }
  }
  function download() {
    const payload = failed?.key === key ? JSON.stringify({ unsaved: failed.value, original: raw }) : raw ?? JSON.stringify(current.current);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "oddk-draft-backup.json"; a.click(); URL.revokeObjectURL(url);
  }
  function discardUnreadable() {
    // Explicit action: preserve the raw bytes before resetting a corrupt draft.
    try {
      const before = localStorage.getItem(key);
      if (before !== null) localStorage.setItem(`${key}.recovery.${Date.now()}`, before);
      localStorage.removeItem(key); setFailed(null); window.dispatchEvent(new Event(eventName));
    } catch { setFailed({ key, value: current.current, message: "초안 원문을 보관하지 못했어요. 입력과 원문을 유지했어요." }); }
  }
  return { value, set: setValue, problem, updatedAt, retry: () => setValue(current.current), download, discardUnreadable };
}
function getSafeScope() { try { return getPlanScope(); } catch { return "unreadable-session"; } }
export function DraftFeedback({ draft }: { draft: { problem: string; updatedAt: string; retry: () => void; download: () => void; discardUnreadable: () => void } }) {
  if (!draft.problem && !draft.updatedAt) return null;
  return <div className="oddk-draftFeedback" role="status">{draft.problem ? <><span>{draft.problem}</span><button type="button" onClick={draft.retry}>초안 저장 재시도</button><button type="button" onClick={draft.download}>초안 백업 받기</button><button type="button" onClick={draft.discardUnreadable}>원문 보관 후 초안 초기화</button></> : <small>이 기기의 초안 보관됨 · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(draft.updatedAt))} (한국 시간)</small>}</div>;
}
