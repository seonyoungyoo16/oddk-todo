import type { KeyboardEvent } from "react";

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
