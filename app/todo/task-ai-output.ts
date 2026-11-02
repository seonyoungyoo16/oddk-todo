import { parseTaskCandidates } from "./batch-tasks.ts";

/** Validate model output; action splitting remains the model's responsibility. */
export function parseTaskAIOutput(source: string, value: unknown): string[] {
  if (value && typeof value === "object" && "titles" in value && Array.isArray(value.titles) && value.titles.length === 0) {
    throw Error("할 일을 찾지 못했어요. 해야 할 행동을 적어주세요.");
  }
  const seen = new Set<string>();
  const original = source.normalize("NFC").replace(/\s+/g, "");
  const titles = parseTaskCandidates(value).filter(title => {
    // A model can turn an explicitly excluded action into "X하지 않기".
    // Remove that candidate only when the same action is explicitly excluded
    // in the source. Standalone avoidance goals such as "야식 먹지 않기" stay.
    const negative = /^(.*?)(?:하지\s*않기|하지\s*말기|안\s*하기|지\s*않기|지\s*말기)[.!?]?$/u.exec(title);
    const stem = negative?.[1].normalize("NFC").replace(/\s+/g, "");
    if (stem) {
      const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const excluded = new RegExp(`${escaped}(?:은|는|을|를|도)?(?:하지말고|하지말아|하지말자|하지않을|하지않겠|안할|안하겠|지말고|지말아|지말자|지않을|지않겠)`);
      if (excluded.test(original)) return false;
    }
    const key = title.normalize("NFC").toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!titles.length) throw Error("할 일을 찾지 못했어요. 해야 할 행동을 적어주세요.");
  return titles;
}
