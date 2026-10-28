/* No fetch handler or application cache: this worker only handles reminders. */
importScripts("./oddk-push-core.js");
const core = globalThis.OddkPushCore;
const scopeUrl = new URL(self.registration.scope);
const databaseName = `oddk-push:${scopeUrl.href}`;
const receiptUrl = "https://synxmskamifpovuziecx.supabase.co/functions/v1/push-receipt";

function database() {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new Error("Notification storage unavailable"));
    request.onblocked = () => { blocked = true; reject(new Error("Notification storage blocked")); };
  });
}
async function stateTransaction(change) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("state", change ? "readwrite" : "readonly");
    const store = transaction.objectStore("state");
    let value;
    const request = store.get("binding");
    request.onsuccess = () => {
      try {
        value = request.result ?? null;
        if (change) { value = change(value); store.put(value, "binding"); }
      } catch { transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(value); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error("Notification state was not saved")); };
  });
}
async function closeNotifications(tag) {
  for (const notification of await self.registration.getNotifications(tag ? { tag } : undefined)) notification.close();
}
function freshState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const deviceToken = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return { installationId: crypto.randomUUID(), deviceToken, epoch: crypto.randomUUID(), userId: null, revision: 0, enabled: false, seen: [] };
}
function inScope(url) {
  const value = new URL(url);
  return value.origin === scopeUrl.origin && value.pathname.startsWith(scopeUrl.pathname);
}
const receiver = core.createReceiver({
  read: () => stateTransaction(), update: change => stateTransaction(change), now: () => Date.now(),
  receipt: async body => {
    const response = await fetch(receiptUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Reminder unavailable");
    return response.json();
  },
  show: (title, options) => self.registration.showNotification(title, options), close: closeNotifications,
  open: async date => {
    const destination = new URL("todo/", scopeUrl);
    destination.searchParams.set("reminder-date", date);
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find(value => inScope(value.url) && new URL(value.url).pathname.replace(/\/$/, "") === destination.pathname.replace(/\/$/, ""));
    if (client) { await client.navigate(destination.href); await client.focus(); }
    else await self.clients.openWindow(destination.href);
  },
});
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => event.waitUntil((async () => {
  try { if (event.data) await receiver.receive(event.data.json()); } catch { /* Fail closed; never show an unverified title. */ }
})()));
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(receiver.click(event.notification.data).catch(() => {}));
});
self.addEventListener("pushsubscriptionchange", event => event.waitUntil((async () => {
  // Reconnection requires a visible authenticated page and explicit user action.
  await stateTransaction(current => {
    if (current !== null && !core.binding(current)) throw new Error("Unreadable notification state");
    return { ...(current ?? freshState()), enabled: false, userId: null, epoch: crypto.randomUUID() };
  });
  await closeNotifications();
})().catch(() => {})));
self.addEventListener("message", event => {
  const port = event.ports?.[0];
  if (!port || !event.source?.id) return;
  event.waitUntil((async () => {
    try {
      const client = await self.clients.get(event.source.id);
      if (!client || !inScope(client.url)) throw new Error("Invalid client");
      const input = event.data;
      if (!input || typeof input !== "object" || !["state", "block", "bind"].includes(input.action)) throw new Error("Invalid action");
      const value = await stateTransaction(current => {
        if (current !== null && !core.binding(current)) throw new Error("Unreadable notification state");
        const state = current ?? freshState();
        if (input.action === "block") {
          if (input.epoch !== undefined && input.epoch !== state.epoch) throw new Error("Stale block");
          return { ...state, enabled: false, userId: null, epoch: crypto.randomUUID() };
        }
        if (input.action === "bind") {
          const candidate = { ...state, userId: input.userId, revision: input.revision, enabled: true };
          if (!core.binding(candidate) || !candidate.userId || input.epoch !== state.epoch || candidate.revision < state.revision) throw new Error("Stale binding");
          return { ...candidate, epoch: crypto.randomUUID() };
        }
        return state;
      });
      if (input.action !== "state") await closeNotifications();
      port.postMessage({ ok: true, state: value });
    } catch { port.postMessage({ ok: false }); }
  })());
});
