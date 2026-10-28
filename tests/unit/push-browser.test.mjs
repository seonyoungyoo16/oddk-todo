import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parsePushPayload } from "../../supabase/functions/_shared/push-delivery.ts";

const code = readFileSync(new URL("../../public/oddk-push-core.js", import.meta.url), "utf8");
const copy = value => JSON.parse(JSON.stringify(value));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = Date.parse("2026-10-28T00:00:00.000Z");
const push = () => ({ v: 1, deliveryId: id(1), receiptToken: "a".repeat(64), userId: id(2), installationId: id(3), revision: 1, expiresAt: new Date(time + 120000).toISOString() });
const initial = () => ({ installationId: id(3), deviceToken: "A".repeat(43), userId: id(2), revision: 1, enabled: true, epoch: id(4), seen: [] });
function harness() {
  const context = vm.createContext({ Date }); vm.runInContext(code, context);
  const h = { core: context.OddkPushCore, state: initial(), calls: [], shown: [], closed: [], opened: [], failSave: false, failShow: false, failAck: false, now: time };
  h.check = () => ({ displayed: false, title: "Synthetic reminder", date: "2026-10-28", startAt: new Date(time).toISOString(), expiresAt: push().expiresAt });
  h.receiver = h.core.createReceiver({
    read: async () => copy(h.state), now: () => h.now,
    update: async change => { if (h.failSave) throw new Error("quota"); h.state = change(copy(h.state)); },
    receipt: async body => { h.calls.push(copy(body)); if (body.action === "ack") { if (h.failAck) throw new Error("network"); return { ok: true }; } return h.check(body); },
    show: async (title, options) => { if (h.failShow) throw new Error("denied"); h.shown.push({ title, ...copy(options) }); await h.afterShow?.(); },
    close: async tag => h.closed.push(tag), open: async date => h.opened.push(date),
  });
  return h;
}
test("browser parser agrees with the server contract and rejects text or unbound/expired payloads before fetching", async () => {
  const h = harness();
  const variants = [null, {}, push(), { ...push(), text: "private" }, { ...push(), revision: 0 }, { ...push(), expiresAt: "2026-10-28" }, { ...push(), receiptToken: "bad" }, { ...push(), installationId: "bad" }];
  for (const value of variants) assert.equal(Boolean(h.core.payload(value)), Boolean(parsePushPayload(value)));
  for (const value of variants.filter(value => !parsePushPayload(value))) await h.receiver.receive(value);
  await h.receiver.receive({ ...push(), expiresAt: new Date(time).toISOString() });
  for (const patch of [{ enabled: false }, { userId: id(9) }, { installationId: id(9) }, { revision: 2 }, { epoch: "bad" }]) {
    h.state = { ...initial(), ...patch }; await h.receiver.receive(push());
  }
  assert.equal(h.calls.length, 0); assert.equal(h.shown.length, 0);
});
test("receiver serializes duplicates, stores a durable marker after show, and sends no secrets to notification data", async () => {
  const h = harness(); await Promise.all([h.receiver.receive(push()), h.receiver.receive(push())]);
  assert.equal(h.shown.length, 1); assert.equal(h.state.seen.length, 1);
  assert.deepEqual(h.calls.map(x => x.action), ["check", "ack", "check", "ack"]);
  assert.equal(h.shown[0].tag, `oddk:${id(1)}`); assert.equal(h.shown[0].body, "09:00 시작");
  const serialized = JSON.stringify(h.shown[0]); assert.equal(serialized.includes(push().receiptToken), false); assert.equal(serialized.includes(h.state.deviceToken), false);
  assert.equal(h.shown[0].renotify, false);
  h.check = () => ({ displayed: true }); await h.receiver.receive({ ...push(), deliveryId: id(9) }); assert.equal(h.shown.length, 1);
});
test("logout and account/revision changes during receipt or show never leave an old account notification or ACK", async () => {
  for (const phase of ["check", "show"]) {
    const h = harness();
    const change = () => { h.state = { ...h.state, enabled: false, userId: null, epoch: id(10) }; };
    if (phase === "check") { const original = h.check; h.check = () => { change(); return original(); }; }
    else h.afterShow = change;
    await h.receiver.receive(push());
    assert.equal(h.calls.some(x => x.action === "ack"), false);
    assert.equal(h.shown.length, phase === "show" ? 1 : 0); assert.equal(h.closed.length, phase === "show" ? 1 : 0);
    assert.equal(h.state.seen.length, 0);
  }
  const h = harness(); h.check = () => { h.state.revision++; return { displayed: false }; }; await h.receiver.receive(push()); assert.equal(h.shown.length, 0);
});
test("network, malformed title/time and denied permission fail closed; failed durable save closes the shown notification", async () => {
  for (const result of [null, {}, { displayed: false }, { ...harness().check(), date: "2026-02-30" }, { ...harness().check(), expiresAt: new Date(time + 180000).toISOString() }]) {
    const h = harness(); h.check = () => result; await h.receiver.receive(push()); assert.equal(h.shown.length, 0);
  }
  const h = harness(); h.check = () => { throw new Error("offline"); }; await assert.rejects(h.receiver.receive(push())); assert.equal(h.shown.length, 0);
  const denied = harness(); denied.failShow = true; await assert.rejects(denied.receiver.receive(push())); assert.equal(denied.state.seen.length, 0); assert.equal(denied.calls.length, 1);
  const quota = harness(); quota.failSave = true; await quota.receiver.receive(push()); assert.equal(quota.closed.length, 1); assert.equal(quota.state.seen.length, 0); assert.equal(quota.calls.length, 1);
});
test("failed ACK and receiver restart never repeat the locally displayed reminder; failed work does not stall the next push", async () => {
  const h = harness(); h.failAck = true; await assert.rejects(h.receiver.receive(push())); assert.equal(h.state.seen.length, 1);
  h.failAck = false; await h.receiver.receive(push()); assert.equal(h.shown.length, 1);
  const restarted = harness(); restarted.state = copy(h.state); await restarted.receiver.receive(push()); assert.equal(restarted.shown.length, 0); assert.equal(restarted.calls.at(-1).action, "ack");
  await h.receiver.receive({ ...push(), deliveryId: id(12) }); assert.equal(h.shown.length, 2);
});
test("click only opens a valid date for the current bound account and generation; history stays bounded", async () => {
  const h = harness(); await h.receiver.receive(push()); const data = h.shown[0].data;
  await h.receiver.click(data); assert.deepEqual(h.opened, ["2026-10-28"]);
  for (const patch of [{ epoch: id(9) }, { userId: id(9) }, { revision: 2 }, { date: "2026-02-30" }, { installationId: id(9) }]) await h.receiver.click({ ...data, ...patch });
  h.state.enabled = false; await h.receiver.click(data); assert.equal(h.opened.length, 1);
  h.state = { ...initial(), seen: Array.from({ length: 500 }, (_, n) => ({ id: id(n + 100), until: time + 10000 })) };
  await h.receiver.receive(push()); assert.equal(h.state.seen.length, 500); assert.equal(h.state.seen.at(-1).id, id(1));
});
