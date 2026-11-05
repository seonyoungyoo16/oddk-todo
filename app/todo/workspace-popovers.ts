const selector = "details.oddk-goalManagement[open], details.oddk-dailyDate[open], details.oddk-detailedFilters[open], details.oddk-planTools[open], details.oddk-startSort[open], details.oddk-headerSearch[open]";

/** Close transient menus only. Accordions, inputs and saved drafts stay untouched. */
export function closeWorkspacePopovers(root: HTMLElement, target?: Node | null) {
  for (const menu of root.querySelectorAll<HTMLDetailsElement>(selector)) {
    if (!target || !menu.contains(target)) menu.open = false;
  }
}

export function installWorkspacePopovers(root: HTMLElement) {
  const doc = root.ownerDocument;
  const capture = { capture: true };
  const outside = (event: Event) => closeWorkspacePopovers(root, event.target as Node | null);
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    // A modal owns Escape while open; do not dismiss menus behind it instead.
    if (root.querySelector("dialog[open]")) return;
    const menus = [...root.querySelectorAll<HTMLDetailsElement>(selector)];
    const menu = menus.find(value => value.contains(event.target as Node)) ?? menus.at(-1);
    if (!menu) return;
    event.preventDefault();
    closeWorkspacePopovers(root);
    menu.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  };
  doc.addEventListener("pointerdown", outside, capture);
  doc.addEventListener("focusin", outside);
  doc.addEventListener("keydown", escape);
  return () => {
    doc.removeEventListener("pointerdown", outside, capture);
    doc.removeEventListener("focusin", outside);
    doc.removeEventListener("keydown", escape);
    closeWorkspacePopovers(root);
  };
}
