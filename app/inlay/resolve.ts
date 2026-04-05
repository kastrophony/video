const SLINGSHOT = "https://slingshot.microcosm.blue";

const didCache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function resolveDidToService(
  did: string,
  serviceId = "#atproto_pds",
): Promise<string> {
  const cacheKey = `${did}:${serviceId}`;
  const cached = didCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const res = await fetch(
    `${SLINGSHOT}/xrpc/com.bad-example.identity.resolveService?did=${
      encodeURIComponent(did)
    }&id=${encodeURIComponent(serviceId)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      `No ${serviceId} service found for DID: ${did} (${
        body.message ?? res.status
      })`,
    );
  }

  const data = (await res.json()) as { endpoint: string };
  didCache.set(cacheKey, {
    value: data.endpoint,
    expires: Date.now() + CACHE_TTL,
  });
  return data.endpoint;
}
