import test from "node:test";
import assert from "node:assert/strict";
import { handleTravelRequest, providerUrl } from "../../supabase/functions/travel-lookup/handler.ts";
const now = new Date("2026-10-28T03:00:00Z");
const search = { action: "search", query: "Brandenburg Gate" };
const route = { action: "route", mode: "car", points: [{ lon: 13.4, lat: 52.5 }, { lon: 13.39, lat: 52.51 }] };
const request = (body = search, origin = "https://seonyoungyoo16.github.io") => new Request("https://example.invalid/travel-lookup", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
function fixture() {
  const cache = new Map(), calls = { get: 0, put: 0, claim: 0, finish: 0, network: 0 }, urls = [];
  const deps = { enabled: true, now: () => now, store: {
    async get(key) { calls.get++; return cache.get(key) ?? null; },
    async put(key, provider, payload, fetchedAt, expiresAt) { calls.put++; assert.ok(!key.includes("Gate")); assert.match(key, /^[a-f0-9]{64}$/); cache.set(key, { payload, expiresAt }); },
    async claim() { calls.claim++; return { id: "lease", validUntil: new Date(now.getTime() + 2000).toISOString() }; },
    async finish(provider, lease) { calls.finish++; assert.equal(lease, "lease"); },
  }, async fetcher(url, options) {
    calls.network++; urls.push(url); assert.match(options.headers["User-Agent"], /oddk-todo/); assert.equal(options.redirect, "error");
    return Response.json(url.includes("photon") ? { features: [{ geometry: { type: "Point", coordinates: [13.4, 52.5] }, properties: { name: "Gate", osm_type: "N", osm_id: 1, city: "Berlin" } }] } : { code: "Ok", routes: [{ legs: [{ duration: 601, distance: 3000 }] }] });
  } };
  return { deps, calls, cache, urls };
}
test("lookup rejects origin, method, content type, oversized body and invalid coordinates before cache or provider", async () => {
  const { deps, calls } = fixture();
  const bad = [request(search, "https://untrusted.invalid"), new Request("https://example.invalid"), new Request("https://example.invalid", { method: "POST", body: "{}" }), new Request("https://example.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(4097) }), request({ ...route, points: [{ lon: 181, lat: 1 }, route.points[1]] }), request({ ...route, mode: ["car"] })];
  const codes = []; for (const req of bad) codes.push((await handleTravelRequest(req, deps)).status);
  assert.deepEqual(codes, [403, 405, 415, 413, 400, 400]); assert.equal(calls.get, 0); assert.equal(calls.network, 0);
  const preflight = await handleTravelRequest(new Request("https://example.invalid", { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3200" } }), deps);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:3200");
});
test("validated lookup caches public candidates, keeps actual query timestamp and skips quota/network on cache hit", async () => {
  const { deps, calls, cache } = fixture();
  const first = await handleTravelRequest(request(), deps), data = await first.json();
  assert.equal(first.status, 200); assert.equal(data.cached, false); assert.equal(data.places[0].name, "Gate"); assert.equal(data.queriedAt, now.toISOString());
  const second = await handleTravelRequest(request(), deps), cached = await second.json();
  assert.equal(cached.cached, true); assert.equal(cached.queriedAt, data.queriedAt);
  assert.deepEqual(calls, { get: 2, put: 1, claim: 1, finish: 1, network: 1 });
  assert.equal(Date.parse([...cache.values()][0].expiresAt) - now.getTime(), 7 * 86400000);
});
test("route uses the selected physical server, validates leg count and caches for one day", async () => {
  const { deps, calls, urls, cache } = fixture();
  const response = await handleTravelRequest(request({ ...route, mode: "foot" }), deps), result = await response.json();
  assert.equal(response.status, 200); assert.match(urls[0], /routed-foot\/route/); assert.equal(result.result.mode, "foot"); assert.equal(result.result.legs[0].seconds, 601);
  assert.match(providerUrl({ ...route, mode: "bike" }), /routed-bike/);
  assert.equal(Date.parse([...cache.values()][0].expiresAt) - now.getTime(), 86400000);
  deps.fetcher = async () => { calls.network++; return Response.json({ code: "NoRoute" }); };
  assert.equal((await handleTravelRequest(request(route), deps)).status, 503);
  assert.equal(calls.finish, 2); assert.equal(cache.size, 1);
});
test("global quota denial and expired reservations prevent all upstream calls", async () => {
  const { deps, calls } = fixture(); deps.store.claim = async () => null;
  const denied = await handleTravelRequest(request(), deps); assert.equal(denied.status, 429); assert.equal((await denied.json()).retryAfterSeconds, 2);
  deps.store.claim = async () => ({ id: "lease", validUntil: now.toISOString() });
  assert.equal((await handleTravelRequest(request(), deps)).status, 429);
  assert.equal(calls.network, 0); assert.equal(calls.finish, 1);
  deps.enabled = false; assert.equal((await handleTravelRequest(request(), deps)).status, 503); assert.equal(calls.network, 0);
});
test("timeouts, excessive upstream bodies, cache errors and upstream throttling preserve failure and release reservations", async () => {
  for (const upstream of [async () => { throw new DOMException("Timeout", "TimeoutError"); }, async () => new Response("x".repeat(1000001)), async () => new Response("slow", { status: 429 })]) {
    const { deps, calls } = fixture(); deps.fetcher = upstream;
    const response = await handleTravelRequest(request(), deps); assert.ok([429, 503].includes(response.status)); assert.equal(calls.put, 0); assert.equal(calls.finish, 1);
  }
  const { deps, calls } = fixture(); deps.store.get = async () => { throw Error("db"); };
  assert.equal((await handleTravelRequest(request(), deps)).status, 503); assert.equal(calls.network, 0);
});
test("expired or malformed cache entries are never served as successful routes", async () => {
  const { deps, calls } = fixture();
  deps.store.get = async () => ({ payload: { action: "route", result: { key: "wrong" } }, expiresAt: "2999-01-01T00:00:00Z" });
  assert.equal((await handleTravelRequest(request(route), deps)).status, 200);
  assert.equal(calls.network, 1);
  deps.store.get = async () => ({ payload: { action: "search", source: "Photon", queriedAt: now.toISOString(), places: [] }, expiresAt: "2000-01-01T00:00:00Z" });
  assert.equal((await handleTravelRequest(request(), deps)).status, 200); assert.equal(calls.network, 2);
});
