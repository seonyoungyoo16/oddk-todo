"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SiApple } from "react-icons/si";
import { APPLE_LOGIN_ENABLED } from "./sync-store";

export function AppleLoginButton({ className = "", disabled = false, label = "Apple로 로그인", placement = "bottom", onClick }: {
  className?: string; disabled?: boolean; label?: string; placement?: "right" | "bottom"; onClick: () => void;
}) {
  const tooltipId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const preparing = !APPLE_LOGIN_ENABLED;
  function show() {
    const bounds = button.current?.getBoundingClientRect();
    if (placement === "right" && bounds) setPosition({ left: bounds.right + 6, top: bounds.top + bounds.height / 2 });
    setShowTooltip(true);
  }
  useEffect(() => {
    if (!showTooltip || placement !== "right") return;
    const hide = () => setShowTooltip(false);
    window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [showTooltip, placement]);
  const tooltip = preparing && <span id={tooltipId} role="tooltip" className="oddk-loginTooltip" hidden={!showTooltip} style={placement === "right" ? { position: "fixed", ...position } : undefined}>서비스 준비중이에요</span>;
  return <span className="oddk-appleLoginWrap" data-placement={placement} onMouseEnter={show} onMouseLeave={() => setShowTooltip(false)}>
    <button ref={button} type="button" className={`${className} oddk-appleLogin`} aria-disabled={preparing || disabled} disabled={!preparing && disabled} aria-describedby={preparing ? tooltipId : undefined}
      onFocus={show} onBlur={() => setShowTooltip(false)}
      onKeyDown={event => { if (preparing && showTooltip && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setShowTooltip(false); } }}
      onClick={() => { if (preparing) show(); else if (!disabled) onClick(); }}>
      <SiApple aria-hidden="true" /><span>{label}</span>
    </button>
    {placement === "right" ? showTooltip && createPortal(tooltip, document.querySelector(".oddk-page") ?? document.body) : tooltip}
  </span>;
}
