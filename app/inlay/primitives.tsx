import { deserializeTree, isValidElement } from "@inlay/core";
import {
  MissingError,
  type RenderContext,
  resolveEndpoint,
  type Resolver,
} from "@inlay/render";
import { Frame, type RemixNode } from "remix/component";

import { InfiniteScroll as InfiniteScrollEntry } from "../assets/infinite-scroll.tsx";
import { Tabs as TabsEntry } from "../assets/tabs.tsx";
import { routes } from "../routes.ts";
import "./types.ts";

// renderNode and resolver are injected to avoid circular deps
let _renderNode: (node: unknown, ctx: RenderContext) => Promise<RemixNode>;
let _resolver: Resolver;
let _qs: URLSearchParams = new URLSearchParams();

export function setRenderNode(
  fn: (node: unknown, ctx: RenderContext) => Promise<RemixNode>,
) {
  _renderNode = fn;
}

export function setResolver(resolver: Resolver) {
  _resolver = resolver;
}

export function setQueryString(qs: string) {
  _qs = new URLSearchParams(qs);
}

let _recordUri: string = "";

export function setRecordUri(uri: string) {
  _recordUri = uri;
}

let _componentUri: string = "";

export function setComponentUri(uri: string) {
  _componentUri = uri;
}

function rn(node: unknown, ctx: RenderContext): Promise<RemixNode> {
  return _renderNode(node, ctx);
}

export type PrimitiveProps = { ctx: RenderContext; props: unknown };
export type PrimitiveFn = (
  p: PrimitiveProps,
) => RemixNode | Promise<RemixNode>;

// --- Blob resolution ---

function extractCid(ref: unknown) {
  if (ref == null) return undefined;
  // CID link object: { $link: "bafkrei..." }
  if (typeof ref === "object") {
    const link = (ref as Record<string, unknown>)["$link"];
    if (typeof link === "string") return link;
  }
  if (typeof ref === "string") return ref;
  return undefined;
}

function resolveCdnSrc(
  src: unknown,
  did: string | undefined,
  imgType: string,
) {
  if (!did || src == null || typeof src !== "object") return null;
  const ref = (src as Record<string, unknown>).ref;
  const cid = extractCid(ref);
  if (!cid) return null;
  return `https://cdn.bsky.app/img/${imgType}/plain/${did}/${cid}@jpeg`;
}

function resolveAvatarSrc(src: unknown, did?: string) {
  return resolveCdnSrc(src, did, "avatar_thumbnail");
}

function resolveBannerSrc(src: unknown, did?: string) {
  return resolveCdnSrc(src, did, "banner");
}

function resolveThumbnailSrc(src: unknown, did?: string) {
  if (src == null) return null;
  if (typeof src === "string") return src;
  return resolveCdnSrc(src, did, "feed_thumbnail");
}

// --- Layout primitives ---

async function Stack({ ctx, props }: PrimitiveProps) {
  const p = props as {
    gap?: string;
    align?: string;
    justify?: string;
    inset?: boolean;
    sticky?: boolean;
    opaque?: boolean;
    children?: unknown[];
  };
  const children = await renderChildren(p.children ?? [], ctx);
  return (
    <org-atsui-stack
      gap={p.gap ?? "medium"}
      align={p.align ?? "stretch"}
      justify={p.justify || undefined}
      inset={p.inset || undefined}
      sticky={p.sticky || undefined}
      opaque={p.opaque || undefined}
    >
      {children}
    </org-atsui-stack>
  );
}

async function Row({ ctx, props }: PrimitiveProps) {
  const p = props as {
    gap?: string;
    align?: string;
    justify?: string;
    inset?: boolean;
    sticky?: boolean;
    opaque?: boolean;
    children?: unknown[];
  };
  const children = await renderChildren(p.children ?? [], ctx);
  return (
    <org-atsui-row
      gap={p.gap ?? "medium"}
      align={p.align ?? "center"}
      justify={p.justify || undefined}
      inset={p.inset || undefined}
      sticky={p.sticky || undefined}
      opaque={p.opaque || undefined}
    >
      {children}
    </org-atsui-row>
  );
}

async function Fill({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown[] };
  const children = await renderChildren(p.children ?? [], ctx);
  return <org-atsui-fill>{children}</org-atsui-fill>;
}

async function Card({ ctx, props }: PrimitiveProps) {
  const p = props as { gap?: string; children?: unknown[] };
  const children = await renderChildren(p.children ?? [], ctx);
  return <org-atsui-card gap={p.gap ?? "medium"}>{children}</org-atsui-card>;
}

async function Grid({ ctx, props }: PrimitiveProps): Promise<RemixNode> {
  const p = props as { columns?: number; gap?: string; children?: unknown[] };
  const children = await renderChildren(p.children ?? [], ctx);
  return (
    <org-atsui-grid
      gap={p.gap ?? "small"}
      style={`--grid-cols:${p.columns ?? 3};--separator:none`}
    >
      {children}
    </org-atsui-grid>
  );
}

async function Clip({ ctx, props }: PrimitiveProps) {
  const p = props as {
    min?: { width: number; height: number };
    max?: { width: number; height: number };
    children?: unknown[];
  };
  const children = await renderChildren(p.children ?? [], ctx);

  const styleParts: string[] = [];
  if (p.min && p.min.width > 0) {
    styleParts.push(`--clip-min:${(p.min.height / p.min.width) * 100}cqi`);
  }
  if (p.max && p.max.width > 0) {
    styleParts.push(`--clip-max:${(p.max.height / p.max.width) * 100}cqi`);
  }

  return (
    <org-atsui-clip style={styleParts.join(";") || undefined}>
      <div>{children}</div>
    </org-atsui-clip>
  );
}

// --- Image primitives ---

function Cover({ props }: PrimitiveProps) {
  const p = props as { src?: unknown; did?: string };
  if (p.src == null) return <org-atsui-cover />;
  const src = resolveBannerSrc(p.src, p.did);
  return (
    <org-atsui-cover
      style={src ? `--cover-src:url(${src})` : undefined}
    />
  );
}

function Avatar({ props }: PrimitiveProps) {
  const p = props as {
    src?: unknown;
    did?: string;
    size?: string;
    lift?: boolean;
  };
  const src = resolveAvatarSrc(p.src, p.did) ??
    resolveThumbnailSrc(p.src, p.did);
  return (
    <org-atsui-avatar size={p.size ?? "medium"} lift={p.lift || undefined}>
      <img src={src ?? undefined} alt="" />
    </org-atsui-avatar>
  );
}

function Blob({ props }: PrimitiveProps) {
  const p = props as {
    src?: unknown;
    did?: string;
    alt?: string;
    ratio?: { width: number; height: number };
    fit?: string;
  };
  const src = resolveThumbnailSrc(p.src, p.did);
  const fit = p.fit === "cover" || p.fit === "contain" ? p.fit : undefined;
  let style: string | undefined;
  if (p.ratio && p.ratio.width > 0 && p.ratio.height > 0) {
    style = `aspect-ratio:${p.ratio.width} / ${p.ratio.height}`;
  }
  return (
    <org-atsui-blob fit={fit} style={style}>
      <img src={src ?? undefined} alt={p.alt ?? ""} />
    </org-atsui-blob>
  );
}

// --- Text primitives ---

async function Title({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown };
  return <org-atsui-title>{await rn(p.children, ctx)}</org-atsui-title>;
}

async function Heading({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown };
  return <org-atsui-heading>{await rn(p.children, ctx)}</org-atsui-heading>;
}

async function Text({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown };
  return <org-atsui-text>{await rn(p.children, ctx)}</org-atsui-text>;
}

async function Caption({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown };
  return <org-atsui-caption>{await rn(p.children, ctx)}</org-atsui-caption>;
}

function Timestamp({ props }: PrimitiveProps) {
  const p = props as { value?: string };
  if (!p.value) return <org-atsui-timestamp />;

  const date = new Date(p.value);
  const now = Date.now();
  const diff = now - date.getTime();
  let relative: string;

  if (diff < 60_000) relative = "now";
  else if (diff < 3_600_000) relative = `${Math.floor(diff / 60_000)}m`;
  else if (diff < 86_400_000) relative = `${Math.floor(diff / 3_600_000)}h`;
  else if (diff < 2_592_000_000) relative = `${Math.floor(diff / 86_400_000)}d`;
  else {
    relative = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  const title = date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return <org-atsui-timestamp title={title}>{relative}</org-atsui-timestamp>;
}

// --- Link ---

function parseAtUri(uri: string) {
  const match = uri.match(/^at:\/\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
  if (!match) return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}

async function Link({ ctx, props }: PrimitiveProps) {
  const p = props as { uri?: string; decoration?: string; children?: unknown };
  if (!p.uri) return <></>;

  const content = p.children != null ? await rn(p.children, ctx) : p.uri;

  if (p.uri.startsWith("did:")) {
    const href = routes.app.href({ atUri: p.uri }, Object.fromEntries(_qs));
    return (
      <org-atsui-link decoration={p.decoration || undefined}>
        <a href={href}>{content}</a>
      </org-atsui-link>
    );
  }

  const parsed = p.uri.startsWith("at://") ? parseAtUri(p.uri) : null;
  if (parsed) {
    const atUri = parsed.collection
      ? `at://${parsed.did}/${parsed.collection}/${parsed.rkey}`
      : `at://${parsed.did}`;
    const href = routes.app.href({ atUri }, Object.fromEntries(_qs));
    return (
      <org-atsui-link decoration={p.decoration || undefined}>
        <a href={href}>{content}</a>
      </org-atsui-link>
    );
  }

  return (
    <org-atsui-link decoration={p.decoration || undefined}>
      <a href={p.uri} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    </org-atsui-link>
  );
}

// --- Fragment / Maybe / Loading / Throw ---

function Fragment({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown[] };
  return renderChildren(p.children ?? [], ctx);
}

async function Maybe({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown[]; fallback?: unknown };
  const children = (p.children ?? []) as unknown[];
  try {
    return await renderChildren(children, ctx);
  } catch (e) {
    if (e instanceof MissingError) {
      if (p.fallback && isValidElement(p.fallback)) {
        return rn(p.fallback, ctx);
      }
      return null;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return <div class="error">{msg}</div>;
  }
}

async function Loading({ ctx, props }: PrimitiveProps) {
  const p = props as { children?: unknown[]; fallback?: unknown };

  const fallback = p.fallback && isValidElement(p.fallback)
    ? await rn(p.fallback, ctx)
    : <org-atsui-caption>Loading...</org-atsui-caption>;

  const children = p.children ?? [];
  if (children.length === 0) return <>{fallback}</>;

  const child = children[0] as { type?: string };
  if (!child.type) return <>{fallback}</>;

  const src = routes.inlay.component.href(
    { atUri: _recordUri },
    { componentUri: _componentUri, childNsid: child.type },
  );

  return <Frame src={src} fallback={<>{fallback}</>} />;
}

function Throw({ props }: PrimitiveProps) {
  const p = props as { message?: string };
  return <div class="error">{p.message ?? "Unknown error"}</div>;
}

// --- Tabs ---

async function Tabs({ ctx, props }: PrimitiveProps) {
  const p = props as {
    items?: Array<{ key: string; label: string; content: unknown }>;
  };
  const items = p.items ?? [];
  if (items.length === 0) return <></>;

  const panels: RemixNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const content = await rn(items[i].content, ctx);
    panels.push(
      <div
        class="tab-panel"
        role="tabpanel"
        data-tab={String(i)}
        hidden={i !== 0 ? true : undefined}
      >
        {content}
      </div>,
    );
  }

  const tabItems = items.map((item) => ({ key: item.key, label: item.label }));
  return (
    <TabsEntry setup={{ items: tabItems }}>
      {panels}
    </TabsEntry>
  );
}

// --- List --- infinite scroll

async function List({ ctx, props }: PrimitiveProps): Promise<RemixNode> {
  const p = props as {
    query: string;
    input?: Record<string, unknown>;
  };
  if (!p.query) {
    return <div class="error">List: missing query</div>;
  }

  const endpoint = await resolveEndpoint(p.query, ctx.imports, _resolver);
  const params: Record<string, string> = {};
  if (p.input) {
    for (const [k, v] of Object.entries(p.input)) {
      if (v != null) params[k] = String(v);
    }
  }

  const page = (await _resolver.xrpc({
    did: endpoint.did,
    nsid: p.query,
    type: "query",
    params,
  })) as { items: unknown[]; cursor?: string };

  const rendered = await Promise.all(
    page.items.map((item) => rn(deserializeTree(item), ctx)),
  );
  const renderedItems: RemixNode[] = [];
  for (let i = 0; i < rendered.length; i++) {
    if (i > 0) renderedItems.push(<hr />);
    renderedItems.push(rendered[i]);
  }

  const importsParam = encodeURIComponent(JSON.stringify(ctx.imports));
  const nextUrl = page.cursor
    ? routes.inlay.list.href(null, {
      query: p.query,
      cursor: page.cursor,
      input: JSON.stringify(p.input),
      imports: importsParam,
    })
    : null;

  return (
    <InfiniteScrollEntry setup={{ nextUrl }}>
      {renderedItems}
    </InfiniteScrollEntry>
  );
}

// --- Record (simplified) ---

function Record({ props }: PrimitiveProps) {
  const p = props as { uri?: string };
  if (!p.uri) return <></>;
  const href = routes.app.href({ atUri: p.uri });
  return (
    <org-atsui-stack gap="medium" inset>
      <org-atsui-caption>Record</org-atsui-caption>
      <org-atsui-link>
        <a href={href}>{p.uri}</a>
      </org-atsui-link>
    </org-atsui-stack>
  );
}

// --- Editor (no-op) ---

function Editor() {
  return <div class="editor-fallback">Editor not available</div>;
}

// --- Helpers ---

async function renderChildren(
  children: unknown[],
  ctx: RenderContext,
): Promise<RemixNode> {
  const parts = await Promise.all(children.map((c) => rn(c, ctx)));
  return <>{parts}</>;
}

// --- Component map ---

export const componentMap: Record<string, PrimitiveFn> = {
  "org.atsui.Stack": Stack,
  "org.atsui.Row": Row,
  "org.atsui.Fill": Fill,
  "org.atsui.Card": Card,
  "org.atsui.Grid": Grid,
  "org.atsui.Clip": Clip,
  "org.atsui.Cover": Cover,
  "org.atsui.Avatar": Avatar,
  "org.atsui.Blob": Blob,
  "org.atsui.Title": Title,
  "org.atsui.Heading": Heading,
  "org.atsui.Text": Text,
  "org.atsui.Caption": Caption,
  "org.atsui.Timestamp": Timestamp,
  "org.atsui.Link": Link,
  "at.inlay.Fragment": Fragment,
  "at.inlay.Maybe": Maybe,
  "at.inlay.Loading": Loading,
  "at.inlay.Throw": Throw,
  "org.atsui.Tabs": Tabs,
  "org.atsui.List": List,
  "org.atsui.Record": Record,
  "org.atsui.Editor": Editor,
};
