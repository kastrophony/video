import { db } from "../../db/kv.ts";
import { CachePolicy, CacheTag } from "./types.ts";

const KV_PREFIX = "inlay:cache:" as const;
const INDEX_PREFIX = "inlay:idx:" as const;

// Life → TTL milliseconds
const LIFE_TTL_MS: Record<string, number> = {
  seconds: 30 * 1000, // 30 seconds
  minutes: 5 * 60 * 1000, // 5 minutes
  hours: 3600 * 1000, // 1 hour
  max: 86400 * 1000, // 24 hours
};

// Convert inlay cache tags to the string format used by the reverse index.
function tagToIndexKeys(tag: CacheTag): string[] {
  if (tag.$type === "at.inlay.defs#tagRecord") {
    return [`record:${tag.uri}`];
  }
  if (tag.$type === "at.inlay.defs#tagLink") {
    if (tag.from) {
      return [`link:${tag.subject}:at://*/${tag.from}/*`];
    }
    return [`link:${tag.subject}:at://*/*`];
  }
  return [];
}

export async function cacheGet(key: string): Promise<unknown | undefined> {
  try {
    const result = await db.get<unknown>([KV_PREFIX, key]);
    if (result.versionstamp === null) {
      return undefined;
    }
    return result.value;
  } catch {
    return undefined;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  policy?: CachePolicy,
): Promise<void> {
  try {
    const life = policy?.life ?? "hours";
    const expireIn = LIFE_TTL_MS[life] ?? LIFE_TTL_MS.hours;

    await db.set([KV_PREFIX, key], value, { expireIn });

    // Build reverse index so the invalidator can find these entries.
    // Uses optimistic locking with version checks to avoid race conditions.
    const indexKeys = (policy?.tags ?? []).flatMap(tagToIndexKeys);
    for (const indexKey of indexKeys) {
      const indexEntryKey = [INDEX_PREFIX, indexKey];
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const existing = await db.get<string[]>(indexEntryKey);
        const version = existing.versionstamp;
        const keys = new Set(existing.value ?? []);
        keys.add(key);

        const atomic = db.atomic().check({
          key: indexEntryKey,
          versionstamp: version,
        })
          .set(indexEntryKey, Array.from(keys), {
            expireIn: expireIn + 3600 * 1000,
          });

        const result = await atomic.commit();
        if (result.ok) break; // Success
        // Otherwise retry with fresh read
      }
    }
  } catch (err) {
    console.error("[cache] set error:", err);
  }
}
