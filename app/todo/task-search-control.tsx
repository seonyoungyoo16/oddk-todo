"use client";

import { useId, useRef } from "react";
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from "react-icons/hi2";
import { usesSafeDialogFocus } from "./dialog-focus";

export function TaskSearchControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const menu = useRef<HTMLDetailsElement>(null), trigger = useRef<HTMLElement>(null), input = useRef<HTMLInputElement>(null);
  const id = useId();
  const close = () => { if (menu.current) menu.current.open = false; trigger.current?.focus({ preventScroll: true }); };
  return <details ref={menu} className="oddk-headerSearch" onToggle={() => { if (menu.current?.open && !usesSafeDialogFocus(menu.current.ownerDocument)) input.current?.focus({ preventScroll: true }); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
    <summary ref={trigger} aria-label="할 일 검색" title="할 일 검색" aria-controls={id} data-active={Boolean(value)}><HiOutlineMagnifyingGlass aria-hidden="true" /></summary>
    <div id={id} className="oddk-headerSearchPanel"><div className="oddk-headerSearchHeading"><h2>할 일 검색</h2><button type="button" aria-label="검색 닫기" onClick={close}><HiOutlineXMark aria-hidden="true" /></button></div>
      <label className="oddk-headerSearchField"><span className="oddk-srOnly">할 일 검색</span><input ref={input} type="search" maxLength={120} aria-label="할 일 검색" value={value} placeholder="제목·상세 메모 검색" onChange={event => onChange(event.target.value)} /></label>
      {value && <button type="button" className="oddk-headerSearchClear" onClick={() => { onChange(""); input.current?.focus({ preventScroll: true }); }}>검색어 지우기</button>}
    </div>
  </details>;
}
