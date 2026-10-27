// JSONB may reorder object keys. Arrays still represent an ordered sequence.
export function sameValue(a: unknown, b: unknown): boolean {
  const ordered = (_key: string, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : value;
  return JSON.stringify(a, ordered) === JSON.stringify(b, ordered);
}
