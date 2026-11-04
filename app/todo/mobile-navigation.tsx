"use client";

import { useEffect, useState } from "react";
import { HiOutlineCalendarDays, HiOutlineCog6Tooth } from "react-icons/hi2";
import { TbTargetArrow } from "react-icons/tb";

export type MobileDestination = "day" | "mandala" | "history" | "settings";
export type WorkspaceDestination = MobileDestination | "profile" | "account";
export function primaryDestination(destination: WorkspaceDestination) {
  return destination === "profile" || destination === "account" || destination === "history" ? "settings" : destination;
}
export const workspaceDestinations = [
  { id: "day", label: "하루계획", Icon: HiOutlineCalendarDays },
  { id: "mandala", label: "목표추적", Icon: TbTargetArrow },
  { id: "settings", label: "환경설정", Icon: HiOutlineCog6Tooth },
] as const;
export const mobileDestinations = workspaceDestinations.filter(({ id }) => id === "day" || id === "mandala" || id === "settings");

export function MobileNavigation({ current: destination, onNavigate }: { current: WorkspaceDestination; onNavigate: (destination: WorkspaceDestination) => void }) {
  const current = primaryDestination(destination);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    let fullHeight = window.innerHeight, width = window.innerWidth, frame = 0;
    const update = () => {
      const editing = document.activeElement?.matches("input:not([type=checkbox]):not([type=radio]),textarea,[contenteditable=true]") ?? false;
      if (width !== window.innerWidth || !editing) { fullHeight = window.innerHeight; width = window.innerWidth; }
      setKeyboardOpen(editing && fullHeight - (window.visualViewport?.height ?? window.innerHeight) > 150);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    window.visualViewport?.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, []);
  return <nav className="oddk-mobileNavigation" aria-label="모바일 페이지 탐색" data-keyboard-open={keyboardOpen}>
    {mobileDestinations.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={current === id ? "page" : undefined} onClick={() => onNavigate(id)}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </button>)}
  </nav>;
}
