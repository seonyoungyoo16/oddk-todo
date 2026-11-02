"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { HiOutlineBars3, HiOutlineCheck, HiOutlineChevronRight, HiOutlineXMark } from "react-icons/hi2";
import { workspaceDestinations, type WorkspaceDestination } from "./mobile-navigation";
import { keepFocusInDialog } from "./dialog-focus";
import { openFullMenuSession } from "./full-menu-session";

export function DesktopSidebar({ current, onNavigate }: { current: WorkspaceDestination; onNavigate: (destination: WorkspaceDestination) => void }) {
  return <aside className="oddk-sidebar oddk-desktopSidebar" aria-label="PC 사이드바">
    <Link href="/" className="oddk-brand" aria-label="oddk 홈으로"><Image src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/logo.png`} alt="oddk" width={1952} height={800} className="oddk-logo" priority /></Link>
    <nav className="oddk-navigation" aria-label="계획 탐색">
      {workspaceDestinations.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={current === id ? "page" : undefined} onClick={() => {
        if (current === id) return;
        onNavigate(id);
        if (id !== "profile") requestAnimationFrame(() => document.getElementById("workspace-title")?.focus({ preventScroll: true }));
      }}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </nav>
  </aside>;
}

export function SharedHeader({ current, onNavigate, actions }: { current: WorkspaceDestination; onNavigate: (destination: WorkspaceDestination) => void; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const session = useRef<ReturnType<typeof openFullMenuSession> | null>(null);
  useEffect(() => () => { session.current?.dispose(); session.current = null; }, []);
  const close = (after?: () => void) => session.current?.close(after);
  function showMenu() {
    if (session.current || !dialog.current || !trigger.current) return;
    session.current = openFullMenuSession({ dialog: dialog.current, trigger: trigger.current, onClosed: () => { session.current = null; setOpen(false); } });
    setOpen(true);
  }
  function select(destination: WorkspaceDestination) {
    close(() => {
      if (destination === current) return;
      onNavigate(destination);
      if (destination === "profile") return;
      requestAnimationFrame(() => {
        const heading = document.getElementById("workspace-title");
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      });
    });
  }
  return <>
    <header className="oddk-sharedHeader">
      <div className="oddk-sharedHeaderInner">
        <button ref={trigger} type="button" className="oddk-sharedMenuToggle" aria-label="전체 메뉴 열기" aria-expanded={open} aria-controls="workspace-full-menu" onClick={showMenu}><HiOutlineBars3 aria-hidden="true" /></button>
        <h1 id="workspace-title" className="oddk-sharedTitle" tabIndex={-1}>{workspaceDestinations.find(destination => destination.id === current)?.label}</h1>
        {actions && <div className="oddk-sharedHeaderActions">{actions}</div>}
      </div>
    </header>
    <dialog ref={dialog} id="workspace-full-menu" className="oddk-dialog oddk-fullMenu" aria-labelledby="workspace-menu-title" onKeyDown={keepFocusInDialog} onClose={() => close()} onCancel={event => { event.preventDefault(); close(); }}>
      <div className="oddk-sharedHeaderInner">
        <button type="button" className="oddk-sharedMenuToggle" data-menu-close="true" aria-label="메뉴 닫기" onClick={() => close()}><HiOutlineXMark aria-hidden="true" /></button>
        <h2 id="workspace-menu-title" className="oddk-sharedTitle">전체 메뉴</h2>
      </div>
      <div className="oddk-fullMenuBody">
        <nav className="oddk-fullMenuLinks" aria-label="전체 페이지 탐색">
          {workspaceDestinations.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={current === id ? "page" : undefined} onClick={() => select(id)}>
            <span className="oddk-fullMenuIcon"><Icon aria-hidden="true" /></span><span>{label}</span>{current === id ? <HiOutlineCheck aria-hidden="true" /> : <HiOutlineChevronRight aria-hidden="true" />}
          </button>)}
        </nav>
      </div>
    </dialog>
  </>;
}
