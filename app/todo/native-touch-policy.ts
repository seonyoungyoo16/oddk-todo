/** Native zoom lock; normal browser gestures/viewport are untouched. */
export function installNativeTouchPolicy(root: Pick<HTMLElement, "getAttribute" | "setAttribute" | "removeAttribute">, native: boolean, surface?: Pick<Document, "addEventListener" | "removeEventListener">) {
  if (!native) return () => {};
  const attribute = "data-oddk-native-touch";
  const previous = root.getAttribute(attribute);
  root.setAttribute(attribute, "locked");
  const events = surface ?? (typeof document !== "undefined" ? document : undefined);
  const blockGesture: EventListener = event => { if (event.cancelable) event.preventDefault(); };
  const blockPinch: EventListener = event => { if ((event as TouchEvent).touches?.length > 1 && event.cancelable) event.preventDefault(); };
  const blockDoubleZoom: EventListener = event => {
    const target = event.target;
    if (typeof Element !== "undefined" && target instanceof Element && target.closest("input,textarea,[contenteditable]")) return;
    if (event.cancelable) event.preventDefault();
  };
  const options = { passive: false };
  events?.addEventListener("gesturestart", blockGesture, options);
  events?.addEventListener("gesturechange", blockGesture, options);
  events?.addEventListener("touchstart", blockPinch, options);
  events?.addEventListener("dblclick", blockDoubleZoom, options);
  return () => {
    events?.removeEventListener("gesturestart", blockGesture);
    events?.removeEventListener("gesturechange", blockGesture);
    events?.removeEventListener("touchstart", blockPinch);
    events?.removeEventListener("dblclick", blockDoubleZoom);
    if (previous === null) root.removeAttribute(attribute);
    else root.setAttribute(attribute, previous);
  };
}
