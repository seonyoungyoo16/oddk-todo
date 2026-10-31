import test from "node:test";
import assert from "node:assert/strict";
import { ADVICE_ENDPOINT, ADVICE_CACHE_KEY, createAdviceLoader, parseAdvice, parseAdviceCache } from "../../app/todo/daily-advice.ts";
import { koreanToday } from "../../app/todo/plan-date.ts";

const advice = { author: "테스트 저자", authorProfile: "테스트 소개", message: "API 응답 검증용 문장" };
const nextAdvice = { ...advice, message: "다음 날 API에서 받은 문장" };
const response = payload => ({ ok: true, json: async () => payload });
function memoryStorage(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem: (key, next) => { assert.equal(key, ADVICE_CACHE_KEY); value = next; } };
}
const cached = (date, value = advice) => JSON.stringify({ version: 1, date, advice: value });

test("validates the provider contract without copying unexpected fields", () => {
  assert.deepEqual(parseAdvice({ ...advice, extra: "ignored" }), advice);
  assert.deepEqual(parseAdvice({ author: " A ", authorProfile: "", message: " B " }), { author: "A", authorProfile: "", message: "B" });
  for (const value of [null, [], {}, { ...advice, author: "" }, { ...advice, message: 12 }, { ...advice, message: "x".repeat(2001) }]) assert.equal(parseAdvice(value), null);
  for (const value of ["broken", cached("2026-02-30"), cached("0000-01-01"), JSON.stringify({ version: 2, date: "2026-10-31", advice })]) assert.equal(parseAdviceCache(value), null);
});

test("requests the actual external endpoint, caches it and reuses it after reload", async () => {
  const storage = memoryStorage(); let calls = 0;
  const load = createAdviceLoader(storage, async (url, init) => {
    calls++; assert.equal(url, ADVICE_ENDPOINT); assert.equal(init.method, "GET");
    assert.equal(init.credentials, "omit"); assert.equal(init.cache, "no-store"); assert.equal(init.referrerPolicy, "no-referrer");
    return response(advice);
  });
  assert.deepEqual((await load("2026-10-31")).advice, advice);
  assert.equal((await load("2026-10-31")).persisted, true);
  const reloaded = createAdviceLoader(storage, async () => { throw new Error("must use cache"); });
  assert.deepEqual((await reloaded("2026-10-31")).advice, advice);
  assert.equal(calls, 1);
});

test("simultaneous mounts share one API request", async () => {
  let resolve, calls = 0;
  const load = createAdviceLoader(memoryStorage(), async () => { calls++; return new Promise(done => { resolve = done; }); });
  const first = load("2026-10-31"), second = load("2026-10-31");
  resolve(response(advice));
  assert.deepEqual(await first, await second); assert.equal(calls, 1);
});

test("the Seoul midnight starts a new API day and retries a repeated previous message", async () => {
  const before = koreanToday(new Date("2026-10-31T14:59:59Z"));
  const after = koreanToday(new Date("2026-10-31T15:00:00Z"));
  const storage = memoryStorage(cached(before)); let calls = 0;
  const load = createAdviceLoader(storage, async () => response(++calls === 1 ? advice : nextAdvice));
  assert.deepEqual((await load(after)).advice, nextAdvice); assert.equal(calls, 2);
  assert.equal(parseAdviceCache(storage.getItem()).date, "2026-11-01");
});

test("repeated responses are bounded and never replace the last successful API result", async () => {
  const original = cached("2026-10-30"), storage = memoryStorage(original); let calls = 0;
  const load = createAdviceLoader(storage, async () => { calls++; return response(advice); });
  await assert.rejects(load("2026-10-31")); assert.equal(calls, 3); assert.equal(storage.getItem(), original);
});

test("HTTP errors, malformed payloads and timeouts preserve the last successful cache", async () => {
  for (const fetcher of [async () => ({ ok: false }), async () => response({ bad: true }), async () => { throw new Error("network"); }, async () => new Promise(() => {})]) {
    const original = cached("2026-10-30"), storage = memoryStorage(original);
    const load = createAdviceLoader(storage, fetcher, 10);
    await assert.rejects(load("2026-10-31")); assert.equal(storage.getItem(), original);
  }
});

test("an error can be retried without poisoning the pending request", async () => {
  let calls = 0;
  const load = createAdviceLoader(memoryStorage(), async () => { if (++calls === 1) throw new Error("offline"); return response(advice); });
  await assert.rejects(load("2026-10-31")); assert.deepEqual((await load("2026-10-31")).advice, advice); assert.equal(calls, 2);
});

test("blocked storage keeps the API response stable in memory and reports the storage limitation", async () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }; let calls = 0;
  const load = createAdviceLoader(storage, async () => { calls++; return response(advice); });
  const first = await load("2026-10-31"); assert.equal(first.persisted, false);
  assert.deepEqual(await load("2026-10-31"), first); assert.equal(calls, 1);
});

test("another tab's same-day response wins instead of being overwritten", async () => {
  const storage = memoryStorage(); let resolve;
  const load = createAdviceLoader(storage, async () => new Promise(done => { resolve = done; }));
  const pending = load("2026-10-31"); storage.setItem(ADVICE_CACHE_KEY, cached("2026-10-31", nextAdvice));
  resolve(response(advice)); assert.deepEqual((await pending).advice, nextAdvice);
});

test("invalid dates make no request and older responses cannot overwrite a newer day", async () => {
  let calls = 0; const storage = memoryStorage(cached("2026-11-01", nextAdvice));
  const load = createAdviceLoader(storage, async () => { calls++; return response(advice); });
  for (const date of ["", "2026-02-29", "not-a-date"]) await assert.rejects(load(date));
  assert.equal(calls, 0);
  await load("2026-10-31"); assert.equal(parseAdviceCache(storage.getItem()).date, "2026-11-01");
});
