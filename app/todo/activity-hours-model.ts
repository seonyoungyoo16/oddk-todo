import type { Availability } from "../../supabase/functions/_shared/schedule.ts";
import { validAvailability } from "../../supabase/functions/_shared/schedule.ts";

// Calendar geometry for overlaps/display only. Never saved as a user's hours.
export const unrestrictedDay: Availability = { start: "00:00", end: "24:00", fixed: [] };

export function activityHoursValue(start: string, end: string, fixed: Availability["fixed"] = []) {
  if (!start || !end) return { value: null, error: "활동 시작과 종료를 모두 입력해주세요." };
  const value = { start, end: end === "00:00" ? "24:00" : end, fixed };
  return validAvailability(value) ? { value, error: "" } : { value: null, error: "종료는 시작 이후로 설정해주세요. 종료 00:00은 이 날짜의 자정이에요." };
}
