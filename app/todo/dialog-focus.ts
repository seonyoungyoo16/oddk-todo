import type { KeyboardEvent } from "react";

const editingSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="hidden"]),textarea,select,[contenteditable]:not([contenteditable="false"])';

export function usesSafeDialogFocus(doc?: Document | null) {
  return doc?.documentElement?.getAttribute?.("data-oddk-native-touch") === "locked" ||
    Boolean(doc?.defaultView?.matchMedia?.("(max-width: 1099px), (pointer: coarse)").matches);
}

/** Choose a non-editing initial target before showModal runs its focusing steps. */
export function openDialogWithFocus(dialog: HTMLDialogElement | null, desktopTarget?: HTMLElement | null) {
  if (!dialog) return;
  const mobile = usesSafeDialogFocus(dialog.ownerDocument);
  const safe = mobile ? dialog.querySelector<HTMLElement>(".oddk-dialogHeader h2, [data-dialog-title], h2, h3") ?? dialog.querySelector<HTMLElement>('button:not([disabled]),[tabindex="-1"]') : null;
  const auto = safe?.getAttribute("autofocus");
  if (safe) { if (safe.tabIndex < 0) safe.tabIndex = -1; safe.setAttribute("autofocus", ""); }
  try {
    if (!dialog.open) dialog.showModal();
    if (mobile) safe?.focus({ preventScroll: true });
    else desktopTarget?.focus();
  } finally {
    if (safe) { if (auto == null) safe.removeAttribute("autofocus"); else safe.setAttribute("autofocus", auto); }
  }
}

/** Closing a mobile dialog must not open a new editing keyboard through a fallback. */
export function restoreDialogFocus(opener?: HTMLElement | null, fallback?: HTMLElement | null) {
  const doc = opener?.ownerDocument ?? fallback?.ownerDocument ?? (typeof document === "undefined" ? null : document);
  let target = opener?.isConnected && (!opener.getClientRects || opener.getClientRects().length) ? opener : fallback;
  if (target && doc?.activeElement === target) return;
  if (doc && usesSafeDialogFocus(doc) && (!target || target.matches?.(editingSelector))) {
    target = doc.querySelector<HTMLElement>('dialog[open] .oddk-dialogHeader h2, dialog[open] button:not([disabled]), #workspace-title');
    if (target && target.tabIndex < 0) target.tabIndex = -1;
  }
  target?.focus({ preventScroll: true });
}

export function keepFocusInDialog(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.getClientRects().length > 0 && element.tabIndex >= 0);
  const first = controls[0], last = controls.at(-1);
  const active = dialog.ownerDocument.activeElement;
  if (event.shiftKey && active === first && last) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && active === last && first) { event.preventDefault(); first.focus(); }
}
