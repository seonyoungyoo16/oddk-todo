type Options = { dialog: HTMLDialogElement; trigger: HTMLElement; onClosed: () => void };

/** A modal navigation layer owns one history entry, never a plan or a draft. */
export function openFullMenuSession({ dialog, trigger, onClosed }: Options) {
  const doc = dialog.ownerDocument, win = doc.defaultView!;
  const originalURL = win.location.href;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const marker = "oddkFullMenu";
  const position = { left: win.scrollX, top: win.scrollY };
  const properties = ["overflow", "position", "top", "left", "right", "width"] as const;
  const previous = properties.map(name => [name, doc.body.style[name]] as const);
  const htmlOverflow = doc.documentElement.style.overflow;
  let finished = false, closing = false, pushed = false;
  let afterClose: (() => void) | undefined;
  const ownsEntry = () => win.location.href === originalURL && win.history.state?.[marker] === token;

  dialog.showModal();
  doc.body.style.overflow = "hidden";
  doc.body.style.position = "fixed";
  doc.body.style.top = `${-position.top}px`;
  doc.body.style.left = `${-position.left}px`;
  doc.body.style.right = "0";
  doc.body.style.width = "100%";
  doc.documentElement.style.overflow = "hidden";

  const finish = (notify = true) => {
    if (finished) return;
    finished = true;
    win.removeEventListener("popstate", popped);
    if (dialog.open) dialog.close();
    for (const [name, value] of previous) doc.body.style[name] = value;
    doc.documentElement.style.overflow = htmlOverflow;
    if (win.location.href === originalURL) win.scrollTo({ ...position, behavior: "instant" });
    if (notify) {
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
      onClosed();
      afterClose?.();
    }
  };
  const popped = () => { if (!ownsEntry()) finish(); };
  win.addEventListener("popstate", popped);
  try {
    win.history.pushState({ ...win.history.state, [marker]: token }, "", originalURL);
    pushed = true;
  } catch { /* A restricted history still has close/Escape and native dialog cancellation. */ }
  dialog.querySelector<HTMLButtonElement>('[data-menu-close="true"]')?.focus({ preventScroll: true });

  return {
    close(after?: () => void) {
      if (finished || closing) return;
      closing = true; afterClose = after;
      if (pushed && ownsEntry()) {
        try { win.history.back(); } catch { finish(); }
      } else finish();
    },
    dispose() {
      const returnHistory = pushed && !closing && ownsEntry();
      finish(false);
      if (returnHistory) { try { win.history.back(); } catch { /* No browser history to unwind. */ } }
    },
  };
}
