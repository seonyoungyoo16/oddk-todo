// Explicit live test: public Berlin landmarks only, never a user's itinerary.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { validRouteEstimate, validTravelPlace } from "../supabase/functions/_shared/travel-query.ts";
const endpoint = "https://synxmskamifpovuziecx.supabase.co/functions/v1/travel-lookup";
const origin = "https://seonyoungyoo16.github.io";
async function post(body, customOrigin = origin) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Origin: customOrigin }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (response.status === 429 && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 2100)); continue; }
    return { response, data };
  }
  throw Error("Lookup retries exhausted");
}
const preflight = await fetch(endpoint, { method: "OPTIONS", headers: { Origin: origin } }); assert.equal(preflight.status, 204);
assert.equal((await post({ action: "route", mode: "car", points: [{ lon: 181, lat: 1 }, { lon: 13, lat: 52 }] })).response.status, 400);
assert.equal((await post({ action: "search", query: "Berlin" }, "https://untrusted.invalid")).response.status, 403);
const oversized = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(4097) }); assert.equal(oversized.status, 413);
const searches = [];
for (const query of ["Brandenburger Tor Berlin", "Reichstagsgebäude Berlin", "Museumsinsel Berlin"]) {
  const result = await post({ action: "search", query }); assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.ok(result.data.places.length > 0 && result.data.places.length <= 5); assert.ok(result.data.places.every(validTravelPlace));
  assert.equal(result.response.headers.get("Access-Control-Allow-Origin"), origin);
  searches.push({ query, ...result.data });
}
const places = searches.map((search, index) => search.places.find(place => place.label.includes("Berlin") && place.lon > 13.2 && place.lon < 13.6 && place.lat > 52.4 && place.lat < 52.6 && (index !== 0 || place.label.includes("Pariser Platz"))));
assert.ok(places.every(Boolean), "Expected public landmark candidate missing; choose a fresh explicit fixture");
const request = { action: "route", mode: "foot", points: places.map(({ lon, lat }) => ({ lon, lat })) };
const route = await post(request); assert.equal(route.response.status, 200, JSON.stringify(route.data)); assert.ok(validRouteEstimate(route.data.result)); assert.equal(route.data.result.legs.length, 2);
const cached = await post(request); assert.equal(cached.response.status, 200); assert.equal(cached.data.cached, true); assert.deepEqual(cached.data.result, route.data.result);
const car = await post({ ...request, mode: "car" }); assert.equal(car.response.status, 200, JSON.stringify(car.data)); assert.equal(car.data.result.mode, "car"); assert.equal(car.data.result.legs.length, 2);
await mkdir(".sync-test-runtime", { recursive: true });
await writeFile(".sync-test-runtime/UX08-live-example.json", JSON.stringify({ searches, places, foot: route.data, car: car.data }, null, 2));
console.log(JSON.stringify({ passed: true, checks: ["preflight", "invalid coordinates 400", "origin 403", "size 413", "three public landmark searches", "two real route legs", "cache and timestamp preserved", "car and foot modes"], places: places.map(place => place.name), footSeconds: route.data.result.legs.map(leg => leg.seconds), carSeconds: car.data.result.legs.map(leg => leg.seconds), queriedAt: route.data.result.queriedAt }));
