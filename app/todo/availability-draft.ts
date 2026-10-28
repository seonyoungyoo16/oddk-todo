import type { Availability } from "../../supabase/functions/_shared/schedule.ts";
import { validAvailability } from "../../supabase/functions/_shared/schedule.ts";
import { isPlanDate } from "../../supabase/functions/_shared/calendar.ts";
export type AvailabilityDrafts = Record<string, { base: Availability; value: Availability }>;
export const emptyAvailabilityDrafts: AvailabilityDrafts = {};
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validAvailabilityDrafts(value: unknown): value is AvailabilityDrafts {
  return object(value) && Object.keys(value).length <= 3660 && Object.entries(value).every(([date, entry]) => {
    if (!isPlanDate(date) || !object(entry) || !validAvailability(entry.base) || !object(entry.value)) return false;
    const draft = entry.value;
    return ["start", "end"].every(k => typeof draft[k] === "string" && draft[k].length <= 120) && Array.isArray(draft.fixed) && draft.fixed.length <= 30 && new Set(draft.fixed.map(block => object(block) ? block.id : null)).size === draft.fixed.length && draft.fixed.every(block => object(block) && typeof block.id === "string" && block.id.length > 0 && block.id.length <= 100 && ["title", "start", "end"].every(k => typeof block[k] === "string" && block[k].length <= (k === "title" ? 60 : 120)));
  });
}
