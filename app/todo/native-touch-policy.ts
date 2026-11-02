/** Disable double-tap zoom only inside the native shell; keep browser zoom untouched. */
export function installNativeTouchPolicy(root: Pick<HTMLElement, "getAttribute" | "setAttribute" | "removeAttribute">, native: boolean) {
  if (!native) return () => {};
  const attribute = "data-oddk-native-touch";
  const previous = root.getAttribute(attribute);
  root.setAttribute(attribute, "manipulation");
  return () => {
    if (previous === null) root.removeAttribute(attribute);
    else root.setAttribute(attribute, previous);
  };
}
