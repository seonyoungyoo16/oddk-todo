export type UpdateRelease = {
  schemaVersion: 1; appId: string; channel: string; runtimeVersion: string;
  bundleId: string; url: string; checksum: string; signature: string; commit: string;
};
type UpdateConfig = { appId: string; channel: string; manifestUrl: string; publicKey: string };
export async function verifyUpdateManifest(value: unknown, config: UpdateConfig, runtime: string): Promise<UpdateRelease> {
  if (!value || typeof value !== "object") throw Error("Invalid update envelope");
  const envelope = value as Record<string, unknown>;
  if (typeof envelope.payload !== "string" || envelope.payload.length > 8192 || typeof envelope.signature !== "string") throw Error("Invalid update signature");
  const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("spki", decode(config.publicKey.replace(/-----[^-]+-----|\s/g, "")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(envelope.signature), new TextEncoder().encode(envelope.payload))) throw Error("Invalid update signature");
  const release = JSON.parse(envelope.payload) as UpdateRelease;
  if (release.schemaVersion !== 1 || release.appId !== config.appId || release.channel !== config.channel || release.runtimeVersion !== runtime) throw Error("Incompatible update");
  if (!/^[a-f0-9]{40}$/.test(release.commit) || !/^[a-f0-9]{12}-[a-f0-9]{12}$/.test(release.bundleId) || !/^[a-f0-9]{64}$/.test(release.checksum) || typeof release.signature !== "string" || !/^[A-Za-z0-9+/]{342}==$/.test(release.signature)) throw Error("Invalid update bundle");
  if (release.bundleId !== `${release.commit.slice(0, 12)}-${release.checksum.slice(0, 12)}`) throw Error("Invalid update identity");
  const expected = new URL(`bundles/${release.bundleId}.zip`, config.manifestUrl);
  if (expected.protocol !== "https:" || release.url !== expected.href) throw Error("Invalid update URL");
  return release;
}

type BundleApi = {
  getCurrentBundle(): Promise<{ bundleId: string | null }>;
  getNextBundle(): Promise<{ bundleId: string | null }>;
  getBlockedBundles(): Promise<{ bundleIds: string[] }>;
  getBundles(): Promise<{ bundleIds: string[] }>;
  downloadBundle(release: { bundleId: string; url: string; checksum: string; signature: string }): Promise<void>;
  setNextBundle(options: { bundleId: string }): Promise<void>;
};
export async function stageNativeUpdate(api: BundleApi, release: UpdateRelease, embeddedCommit: string) {
  const current = await api.getCurrentBundle(), next = await api.getNextBundle();
  if (current.bundleId === release.bundleId || next.bundleId === release.bundleId || (!current.bundleId && release.commit === embeddedCommit)) return "current";
  if ((await api.getBlockedBundles()).bundleIds.includes(release.bundleId)) return "blocked";
  if (!(await api.getBundles()).bundleIds.includes(release.bundleId)) await api.downloadBundle(release);
  await api.setNextBundle({ bundleId: release.bundleId });
  return "staged";
}
