/**
 * What the browser has promised about the space this app is using.
 *
 * Everything the app ships lives in the origin's quota: the service worker's
 * precache holds the shell, the grammar and every test, and the runtime cache
 * holds the dictionary and the paradigms. By default that storage is
 * *best-effort* — under disk pressure a browser may evict a whole origin, and
 * it evicts the precache along with the rest. The failure that produces is not
 * "vocabulary stopped working": it is an installed app that will not open on a
 * plane, because the shell it boots from is gone too.
 *
 * `navigator.storage.persist()` is the fix and the whole of it. A persisted
 * origin is exempt from automatic eviction; only the student clearing site data
 * takes it away.
 *
 * Every function here is feature-detected and swallows its errors. Storage that
 * cannot be asked about is storage the app carries on without — none of this is
 * load-bearing for studying, and a browser that has never heard of
 * `StorageManager` must not take the app down with it.
 */

/** Bytes held under this origin's quota, and what the quota is. */
export interface StorageUsage {
  usage: number;
  quota: number;
}

/** Whether this origin's storage is already exempt from eviction. */
export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Ask for persistence, and say whether it was granted.
 *
 * Meant for a button: browsers differ on whether this is silent, and one of
 * them puts a permission prompt on screen. A prompt is fine in answer to a
 * press and startling at boot, which is why `persistIfSilent` exists beside
 * this rather than this being called on load.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Take persistence at boot, but only where asking costs the student nothing.
 *
 * The permission is queried first and the request is made only when the answer
 * is already `granted` — a browser that would put a dialog up says `prompt`
 * instead, and gets left alone until Settings offers the button. So this is
 * silent everywhere: it flips the bit for an installed app that has earned the
 * grant, and does nothing visible anywhere else.
 *
 * `persistent-storage` is not a permission name every browser knows, and
 * querying an unknown name throws rather than returning a state — hence the
 * catch, which lands on the same do-nothing branch as `prompt`.
 */
export async function persistIfSilent(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await isPersisted()) return true;
  try {
    const status = await navigator.permissions?.query({
      name: "persistent-storage" as PermissionName,
    });
    if (status?.state !== "granted") return false;
  } catch {
    return false;
  }
  return requestPersistence();
}

/**
 * How much this origin is holding, and out of how much.
 *
 * `estimate()` reports the whole origin — precache, runtime cache and
 * `localStorage` together — which is exactly the number Settings wants, since
 * eviction is decided per origin too. Null when the browser will not say.
 */
export async function storageUsage(): Promise<StorageUsage | null> {
  try {
    const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
    if (usage === undefined || quota === undefined) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Both answers together, which is what a panel showing them wants. */
export interface StorageReport {
  persisted: boolean;
  usage: StorageUsage | null;
}

export async function readStorage(): Promise<StorageReport> {
  const [persisted, usage] = await Promise.all([isPersisted(), storageUsage()]);
  return { persisted, usage };
}

/** Bytes as a student would read them: "6.4 MB", "1.2 GB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
