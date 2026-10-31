const OPEN_SETTINGS_DIALOG = "oddk-open-settings-dialog";

export type SettingsDialog = "sync" | "profile";

export function openSettingsDialog(target: SettingsDialog) {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_DIALOG, { detail: target }));
}

export function subscribeSettingsDialog(open: (target: SettingsDialog) => void) {
  const listener = (event: Event) => {
    const target = (event as CustomEvent<unknown>).detail;
    if (target === "sync" || target === "profile") open(target);
  };
  window.addEventListener(OPEN_SETTINGS_DIALOG, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_DIALOG, listener);
}
