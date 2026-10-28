// Deno-only adapter. The shared handler remains checked by Next/Node as well.
import { isPushEndpoint } from "../_shared/push-subscription.ts";
import { parsePushPayload } from "../_shared/push-delivery.ts";
import type { PushSender } from "./handler.ts";
// Hosted Edge environment variables are read-only. Refuse an unsafe debug
// configuration before http_ece evaluates instead of trying to mutate it.
if (Deno.env.get("ECE_KEYLOG") === "1") throw new Error("Unsafe encryption logging configuration");
// @deno-types="npm:@types/web-push@3.6.4"
const { default: webpush } = await import("npm:web-push@3.6.7");
export function encryptedSender(fetcher: typeof fetch): PushSender {
  return async (subscription, keys, payload, ttl, topic) => {
    if (!isPushEndpoint(subscription.endpoint) || !Number.isInteger(ttl) || ttl < 1 || ttl > 300 || !/^[a-f0-9]{32}$/.test(topic)) throw new Error("Invalid push destination");
    const message = parsePushPayload(payload);
    if (!message) throw new Error("Invalid push payload");
    const details = webpush.generateRequestDetails(subscription, JSON.stringify(message), {
      TTL: ttl, topic, urgency: "normal", contentEncoding: "aes128gcm",
      vapidDetails: { subject: "https://seonyoungyoo16.github.io/oddk-todo/", ...keys },
    });
    if (details.endpoint !== subscription.endpoint || details.method !== "POST" || !(details.body instanceof Uint8Array) || details.body.byteLength > 4096) throw new Error("Invalid push request");
    const headers = new Headers(Object.entries(details.headers).map(([name, value]) => [name, String(value)]));
    const response = await fetcher(details.endpoint, { method: "POST", headers, body: new Uint8Array(details.body), redirect: "error", signal: AbortSignal.timeout(8000) });
    const result = { status: response.status, retryAfter: response.headers.get("retry-after") };
    // Receiving a provider acceptance is conclusive even if discarding its
    // unused response body fails; do not turn that into a duplicate retry.
    await response.body?.cancel().catch(() => undefined);
    return result;
  };
}
