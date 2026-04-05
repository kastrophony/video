import { CachePolicy } from "./types.ts";

const memCache = new Map<string, unknown>();

// deno-lint-ignore require-await
export async function cacheGet(key: string): Promise<unknown | undefined> {
  return memCache.get(key);
}

// deno-lint-ignore require-await
export async function cacheSet(
  key: string,
  value: unknown,
  _policy?: CachePolicy,
): Promise<void> {
  memCache.set(key, value);
}
