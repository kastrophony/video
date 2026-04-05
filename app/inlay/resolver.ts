import { LexResolver } from "@atproto/lex-resolver";
import { AtUri, AtUriString } from "@atproto/syntax";
import { MissingError, type Resolver } from "@inlay/render";

import { cacheGet, cacheSet } from "./cache.ts";
import { resolveDidToService } from "./resolve.ts";
import { CachePolicy, CacheTag } from "./types.ts";

const lexResolver = new LexResolver({});

type ComponentResponse = {
  node: unknown;
  cache?: CachePolicy;
};

const SLINGSHOT = "https://slingshot.microcosm.blue";

async function fetchRecordFromPds(uri: string): Promise<unknown | null> {
  const key = `record:${uri}`;
  const hit = await cacheGet(key);
  if (hit !== undefined) return hit;

  const parsed = new AtUri(uri);
  const res = await fetch(
    `${SLINGSHOT}/xrpc/com.atproto.repo.getRecord?repo=${
      encodeURIComponent(parsed.host)
    }&collection=${encodeURIComponent(parsed.collection)}&rkey=${
      encodeURIComponent(parsed.rkey)
    }`,
  );
  if (!res.ok) {
    // Cache misses to avoid hammering PDS for records that don't exist.
    // Uses shorter TTL than hits — the record might be created later.
    await cacheSet(key, null, { life: "minutes" });
    return null;
  }

  const data = await res.json();
  const value = data.value as Record<string, unknown>;
  await cacheSet(key, value, {
    life: "hours",
    tags: [{ $type: "at.inlay.defs#tagRecord", uri }],
  });
  return value;
}

// --- XRPC ---

async function callXrpc(
  serviceUrl: string,
  params: {
    nsid: string;
    type?: string;
    body?: unknown;
    params?: Record<string, string>;
  },
): Promise<unknown> {
  const headers: Record<string, string> = {};

  if (params.type === "query") {
    const qs = new URLSearchParams();
    if (params.params) {
      for (const [k, v] of Object.entries(params.params)) {
        if (v != null) qs.set(k, v);
      }
    }
    const qsStr = qs.toString();
    const url = `${serviceUrl}/xrpc/${params.nsid}${qsStr ? `?${qsStr}` : ""}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      MissingError.rethrowFromResponse(text);
      throw new Error(
        `XRPC query failed (${params.nsid}): ${res.status} ${text}`,
      );
    }
    return res.json();
  }

  headers["Content-Type"] = "application/json";
  const url = `${serviceUrl}/xrpc/${params.nsid}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params.body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    MissingError.rethrowFromResponse(text);
    throw new Error(
      `XRPC procedure failed (${params.nsid}): ${res.status} ${text}`,
    );
  }
  return res.json();
}

export function createResolver(): Resolver {
  return {
    fetchRecord(uri) {
      return fetchRecordFromPds(uri);
    },

    async resolve(dids, collection, rkey) {
      const uris = dids.map((did) => `at://${did}/${collection}/${rkey}`);
      const promises = uris.map((uri) => fetchRecordFromPds(uri));
      for (let i = 0; i < dids.length; i++) {
        const record = await promises[i];
        if (record) {
          return { did: dids[i], uri: uris[i] as AtUriString, record };
        }
      }
      return null;
    },

    async xrpc(params) {
      let serviceUrl: string;
      try {
        serviceUrl = await resolveDidToService(params.did, "#inlay");
      } catch {
        throw new Error(
          `XRPC resolve failed for ${params.nsid} (did=${params.did})`,
        );
      }

      if (!params.componentUri || params.type === "query") {
        return callXrpc(serviceUrl, params);
      }

      const key = `xrpc:${JSON.stringify(params)}`;
      const hit = await cacheGet(key);
      if (hit !== undefined) return hit;

      const value = await callXrpc(serviceUrl, params);
      const response = value as ComponentResponse;

      const tags: CacheTag[] = [
        ...(response.cache?.tags ?? []),
        { $type: "at.inlay.defs#tagRecord", uri: params.componentUri },
      ];
      const life = response.cache?.life ?? "hours";

      await cacheSet(key, value, { life, tags });
      return value;
    },

    async resolveLexicon(nsid) {
      const key = `lexicon:${nsid}`;
      const hit = await cacheGet(key);
      if (hit !== undefined) return hit;

      try {
        const { lexicon } = await lexResolver.get(nsid);
        await cacheSet(key, lexicon, { life: "hours" });
        return lexicon;
      } catch {
        await cacheSet(key, null, { life: "hours" });
        return null;
      }
    },
  };
}
