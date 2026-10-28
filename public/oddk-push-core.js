/* Shared by the classic service worker and the isolated runtime tests. */
(() => {
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
  const revision = value => Number.isSafeInteger(value) && value > 0 && value < Number.MAX_SAFE_INTEGER;
  function payload(value) {
    if (!record(value) || Object.keys(value).length !== 7 || value.v !== 1 || ![value.deliveryId, value.userId, value.installationId].every(uuid) || typeof value.receiptToken !== "string" || !/^[a-f0-9]{64}$/.test(value.receiptToken) || !revision(value.revision) || typeof value.expiresAt !== "string" || value.expiresAt.length > 40 || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt).toISOString() !== value.expiresAt) return null;
    return value;
  }
  function binding(value) {
    return record(value) && uuid(value.installationId) && typeof value.deviceToken === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value.deviceToken) && uuid(value.epoch) && typeof value.enabled === "boolean" && (value.userId === null || uuid(value.userId)) && Number.isSafeInteger(value.revision) && value.revision >= 0 && value.revision < Number.MAX_SAFE_INTEGER && Array.isArray(value.seen) && value.seen.length <= 500 && value.seen.every(item => record(item) && uuid(item.id) && Number.isFinite(item.until) && item.until > 0);
  }
  function matches(state, message, epoch) {
    return binding(state) && state.enabled && state.userId === message.userId && state.installationId === message.installationId && state.revision === message.revision && (!epoch || state.epoch === epoch);
  }
  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const ms = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value && value.slice(0, 4) !== "0000";
  }
  function createReceiver(deps) {
    let queue = Promise.resolve();
    async function receive(raw) {
      const message = payload(raw);
      if (!message || Date.parse(message.expiresAt) <= deps.now()) return;
      const state = await deps.read();
      if (!matches(state, message)) return;
      const request = { deliveryId: message.deliveryId, receiptToken: message.receiptToken, installationId: state.installationId, deviceToken: state.deviceToken, userId: state.userId, revision: state.revision };
      const checked = await deps.receipt({ ...request, action: "check" });
      if (!matches(await deps.read(), message, state.epoch) || Date.parse(message.expiresAt) <= deps.now()) return;
      if (!record(checked) || typeof checked.displayed !== "boolean") return;
      if (checked.displayed) return;
      if (state.seen.some(item => item.id === message.deliveryId)) { await deps.receipt({ ...request, action: "ack" }); return; }
      if (typeof checked.title !== "string" || !checked.title.trim() || checked.title.length > 5000 || !date(checked.date) || !Number.isFinite(Date.parse(checked.startAt)) || checked.expiresAt !== message.expiresAt) return;
      const tag = `oddk:${message.deliveryId}`;
      await deps.show(checked.title.slice(0, 200), {
        body: `${new Date(checked.startAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false })} 시작`,
        tag, renotify: false,
        data: { userId: state.userId, installationId: state.installationId, revision: state.revision, epoch: state.epoch, date: checked.date },
      });
      try {
        await deps.update(current => {
          if (!matches(current, message, state.epoch)) throw new Error("Account changed");
          return { ...current, seen: [...current.seen.filter(item => Number.isFinite(item.until) && item.until > deps.now() && item.id !== message.deliveryId).slice(-499), { id: message.deliveryId, until: deps.now() + 7 * 86400000 }] };
        });
        if (!matches(await deps.read(), message, state.epoch)) throw new Error("Account changed");
      } catch { await deps.close(tag); return; }
      // Only acknowledge after the platform accepted showNotification and the
      // local durable marker committed. A failed ACK is deduped on next receipt.
      await deps.receipt({ ...request, action: "ack" });
    }
    return {
      receive(raw) {
        const next = queue.then(() => receive(raw));
        queue = next.catch(() => {});
        return next;
      },
      async click(data) {
        if (!record(data) || !uuid(data.epoch) || !date(data.date)) return;
        if (!matches(await deps.read(), data, data.epoch)) return;
        await deps.open(data.date);
      },
    };
  }
  globalThis.OddkPushCore = { payload, binding, date, createReceiver };
})();
