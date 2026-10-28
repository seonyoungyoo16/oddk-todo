export async function readJsonBounded(req: Request, limit: number): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("empty body");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new RangeError("body limit"); }
      chunks.push(part.value);
    }
    const data = new Uint8Array(length); let at = 0;
    for (const part of chunks) { data.set(part, at); at += part.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } finally { reader.releaseLock(); }
}
