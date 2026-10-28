export type TravelMode = "car" | "foot" | "bike";
export type Coordinate = { lon: number; lat: number };
export type TravelPlace = Coordinate & { id: string; name: string; label: string };
export type TravelQuery = { action: "search"; query: string } | { action: "route"; mode: TravelMode; points: Coordinate[] };
export type RouteEstimate = { key: string; mode: TravelMode; queriedAt: string; source: "OSRM/FOSSGIS"; legs: Array<{ seconds: number; meters: number }> };
export type LookupPayload = { action: "search"; source: "Photon"; queriedAt: string; places: TravelPlace[] } | { action: "route"; result: RouteEstimate };
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validCoordinate(v: unknown): v is Coordinate {
  return object(v) && typeof v.lon === "number" && Number.isFinite(v.lon) && Math.abs(v.lon) <= 180 && typeof v.lat === "number" && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90;
}
export function validTravelPlace(v: unknown): v is TravelPlace {
  return object(v) && ["id", "name", "label"].every(key => typeof v[key] === "string" && v[key].length > 0 && v[key].length <= (key === "label" ? 300 : 120)) && validCoordinate(v);
}
export function parseTravelQuery(text: string): TravelQuery {
  if (new TextEncoder().encode(text).length > 4096) throw new Error("조회 요청이 너무 커요.");
  const v: unknown = JSON.parse(text);
  if (!object(v)) throw new Error("조회 조건을 확인해주세요.");
  if (v.action === "search" && typeof v.query === "string" && v.query.trim().length >= 2 && v.query.trim().length <= 120 && !/[\u0000-\u001f]/.test(v.query)) return { action: "search", query: v.query.normalize("NFC").trim() };
  if (v.action === "route" && typeof v.mode === "string" && ["car", "foot", "bike"].includes(String(v.mode)) && Array.isArray(v.points) && v.points.length >= 2 && v.points.length <= 6 && v.points.every(validCoordinate)) return { action: "route", mode: v.mode as TravelMode, points: v.points.map(point => ({ lon: point.lon, lat: point.lat })) };
  throw new Error("장소 2~6개와 이동 수단을 확인해주세요.");
}
export function routeKey(mode: TravelMode, points: Coordinate[]): string {
  return JSON.stringify({ mode, points: points.map(point => [point.lon, point.lat]) });
}
export function validRouteEstimate(v: unknown): v is RouteEstimate {
  return object(v) && typeof v.key === "string" && v.key.length <= 1000 && typeof v.mode === "string" && ["car", "foot", "bike"].includes(String(v.mode)) && typeof v.queriedAt === "string" && Number.isFinite(Date.parse(v.queriedAt)) && v.source === "OSRM/FOSSGIS" && Array.isArray(v.legs) && v.legs.length >= 1 && v.legs.length <= 5 && v.legs.every(leg => object(leg) && typeof leg.seconds === "number" && Number.isFinite(leg.seconds) && leg.seconds > 0 && leg.seconds <= 86400 && typeof leg.meters === "number" && Number.isFinite(leg.meters) && leg.meters >= 0 && leg.meters <= 20000000);
}
export function validLookupPayload(v: unknown, query: TravelQuery): v is LookupPayload {
  if (!object(v) || v.action !== query.action) return false;
  if (query.action === "search") return v.source === "Photon" && typeof v.queriedAt === "string" && Number.isFinite(Date.parse(v.queriedAt)) && Array.isArray(v.places) && v.places.length <= 5 && v.places.every(validTravelPlace);
  return validRouteEstimate(v.result) && v.result.key === routeKey(query.mode, query.points) && v.result.mode === query.mode && v.result.legs.length === query.points.length - 1;
}
export function parsePhoton(value: unknown): TravelPlace[] {
  if (!object(value) || !Array.isArray(value.features)) throw new Error("장소 검색 결과 형식이 올바르지 않아요.");
  return value.features.slice(0, 5).flatMap(feature => {
    if (!object(feature) || !object(feature.geometry) || feature.geometry.type !== "Point" || !Array.isArray(feature.geometry.coordinates) || !object(feature.properties)) return [];
    const p = feature.properties, coordinates = { lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] };
    if (!validCoordinate(coordinates) || typeof p.name !== "string" || !p.name.trim() || !(typeof p.osm_id === "number" || typeof p.osm_id === "string") || typeof p.osm_type !== "string") return [];
    const name = p.name.slice(0, 120), label = [...new Set([name, p.street, p.city, p.state, p.country].filter(v => typeof v === "string" && v))].join(" · ").slice(0, 300);
    return [{ ...coordinates, id: `${p.osm_type}:${p.osm_id}`, name, label }];
  }).filter(validTravelPlace);
}
export function parseOsrm(value: unknown, query: Extract<TravelQuery, { action: "route" }>, queriedAt: string): RouteEstimate {
  if (!object(value) || value.code !== "Ok" || !Array.isArray(value.routes) || !object(value.routes[0]) || !Array.isArray(value.routes[0].legs) || value.routes[0].legs.length !== query.points.length - 1) throw new Error("이 경로를 조회하지 못했어요. 장소를 다시 선택하거나 이동 시간을 직접 입력해주세요.");
  const result = { key: routeKey(query.mode, query.points), mode: query.mode, queriedAt, source: "OSRM/FOSSGIS", legs: value.routes[0].legs.map((leg: unknown) => object(leg) ? { seconds: leg.duration, meters: leg.distance } : null) };
  if (!validRouteEstimate(result)) throw new Error("이동 시간 응답이 올바르지 않아요. 직접 입력으로 계속할 수 있어요.");
  return result;
}
