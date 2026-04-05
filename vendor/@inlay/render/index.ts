// @inlay/render — Component resolution with pluggable I/O

import {
  $,
  deserializeTree,
  isValidElement,
  resolveBindings,
  serializeTree,
  walkTree,
} from "@inlay/core";
import type { Element } from "@inlay/core";
import {
  AtIdentifierString,
  AtUri,
  AtUriString,
  DidString,
  ensureValidDid,
  ensureValidNsid,
  NsidString,
} from "@atproto/syntax";
export type { NsidString } from "@atproto/syntax";
import { validateProps } from "./validate.ts";

import type {
  Main as ComponentRecord,
  View,
} from "../../../generated/at/inlay/component.defs.ts";
import { viewRecord as viewRecordSchema } from "../../../generated/at/inlay/component.defs.ts";
import type { CachePolicy } from "../../../generated/at/inlay/defs.defs.ts";

// --- Public types ---

export type { Main as ComponentRecord } from "../../../generated/at/inlay/component.defs.ts";
export type { CachePolicy } from "../../../generated/at/inlay/defs.defs.ts";

export type EndpointRecord = {
  did: string;
  createdAt: string;
};

export interface Resolver {
  fetchRecord(uri: AtUriString): Promise<unknown | null>;
  xrpc(params: {
    did: string;
    nsid: string;
    type: "query" | "procedure";
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    componentUri?: string;
    personalized?: boolean;
  }): Promise<unknown>;
  resolveLexicon(nsid: string): Promise<unknown | null>;
  /**
   * Find the first DID (in order) that has a record in the given collection
   * with the given rkey. Used for component and endpoint resolution.
   */
  resolve(
    dids: DidString[],
    collection: string,
    rkey: string,
  ): Promise<{ did: DidString; uri: AtUriString; record: unknown } | null>;
}

export type RenderOptions = {
  resolver: Resolver;
  maxDepth?: number;
  builtins?: Set<NsidString>;
};

/**
 * Plain, serializable render context.
 *
 * - `imports`: ordered DIDs for type resolution
 * - `component`: when present, the first render uses this component directly
 *    (root render). Stripped from child contexts automatically.
 * - `componentUri`: AT URI of the root component record. Passed to xrpc
 *    for external components.
 * - `depth`: current nesting depth (default 0). Incremented on each
 *    component boundary to prevent infinite recursion.
 * - `scope`: template variable bindings. Bindings in child element props
 *    resolve against this at the next render boundary.
 * - `stack`: component NSID chain for error reporting. Most recent
 *    component first — the "who rendered who" owner chain.
 */
export type RenderContext = {
  imports: DidString[];
  component?: ComponentRecord;
  componentUri?: string;
  depth?: number;
  scope?: Record<string, unknown>;
  stack?: string[];
};

export type RenderResult = {
  node: unknown;
  context: RenderContext;
  props: Record<string, unknown>;
  cache?: CachePolicy;
};

// Caller context overrides: elements passed as props to a component are tagged
// so they resolve through the CALLER's imports, not the component's. Both
// template and external components use this mechanism. render() checks the
// WeakMap transparently before resolving any element.
const slotContexts = new WeakMap<object, RenderContext>();

export class MissingError extends Error {
  kind = "missing" as const;
  path: string[];
  componentStack: string[] = [];
  constructor(path: string[]) {
    super(`Missing: ${path.join(".")}`);
    this.path = path;
  }

  /**
   * If an XRPC error response body encodes a MissingError, throw it.
   * No-op if the body doesn't represent a MissingError.
   */
  static rethrowFromResponse(body: string): void {
    try {
      const json = JSON.parse(body);
      const err = json.error ?? json;
      if (err.name === "MissingError" && typeof err.message === "string") {
        const raw = err.message.replace(/^Missing:\s*/, "");
        throw new MissingError([raw]);
      }
    } catch (e) {
      if (e instanceof MissingError) throw e;
    }
  }
}

const DEFAULT_MAX_DEPTH = 30;

// --- Public API ---

export function createContext(
  component: ComponentRecord,
  componentUri: string,
): RenderContext {
  return {
    imports: component.imports ?? [],
    component,
    componentUri,
  };
}

export async function render(
  element: Element,
  context: RenderContext,
  options: RenderOptions,
): Promise<RenderResult> {
  const { resolver } = options;
  const ctx = slotContexts.get(element) ?? context;
  const depth = ctx.depth ?? 0;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  let errorStack = ctx.stack;

  try {
    const type = element.type;
    let props = (element.props ?? {}) as Record<string, unknown>;

    // Resolve any Bindings left in props by the parent template
    if (ctx.scope) {
      props = resolveBindings(props, scopeResolver(ctx.scope));
    }

    // Root render: use component directly
    if (ctx.component) {
      const nsid = new AtUri(ctx.componentUri!).rkey;
      if (type !== nsid) {
        throw new Error(`render was given ${nsid}, cannot render ${type}`);
      }
      errorStack = [type, ...(ctx.stack ?? [])];
      return await renderComponent(
        resolver,
        ctx.component,
        ctx.componentUri,
        element,
        props,
        ctx,
      );
    }

    if (type.startsWith("at.inlay.")) {
      if (type === "at.inlay.Missing") {
        const path = props.path;
        if (!Array.isArray(path) || path.length === 0) {
          throw new Error(
            "at.inlay.Missing requires path with at least 1 item",
          );
        }
        throw new MissingError(path as string[]);
      }
      return {
        node: null,
        context: {
          imports: ctx.imports,
          scope: ctx.scope,
          stack: ctx.stack,
        },
        props,
      };
    }

    // Past here we're rendering a component — include it in the owner stack.
    errorStack = [type, ...(ctx.stack ?? [])];

    if (depth >= maxDepth) {
      throw Error("Component depth limit exceeded");
    }

    // Host-provided builtins: render as primitive (no body)
    if (options.builtins?.has(type)) {
      return {
        node: null,
        context: {
          imports: ctx.imports,
          scope: ctx.scope,
          stack: ctx.stack,
        },
        props,
      };
    }

    const { component, componentUri } = await resolveType(
      type,
      ctx.imports,
      resolver,
    );
    return await renderComponent(
      resolver,
      component,
      componentUri,
      element,
      props,
      ctx,
    );
  } catch (e) {
    if (e != null && typeof e === "object") {
      (e as Record<string, unknown>).componentStack = errorStack ?? [];
    }
    throw e;
  }
}

/** Build a resolve callback that looks up paths in a scope. Returns a Missing element on null. */
function scopeResolver(
  scope: Record<string, unknown>,
): (path: string[]) => unknown {
  return (path) => {
    if (path.length === 0) throw new Error("Binding path must not be empty");
    const ns = path[0];
    if (ns !== "props" && ns !== "record") {
      const name = path.join(".");
      // Check if the unqualified name exists under props or record for a hint
      const hints: string[] = [];
      if (scope.props != null && typeof scope.props === "object") {
        if (Object.hasOwn(scope.props as object, ns)) {
          hints.push(`props.${name}`);
        }
      }
      if (scope.record != null && typeof scope.record === "object") {
        if (Object.hasOwn(scope.record as object, ns)) {
          hints.push(`record.${name}`);
        }
      }
      let msg =
        `Invalid binding {${name}}: bindings must start with "props" or "record" (e.g. {props.${name}} or {record.${name}}).`;
      if (hints.length > 0) {
        msg += ` Did you mean {${hints.join("} or {")}}?`;
      }
      throw new Error(msg);
    }
    const value = resolvePath(scope, path);
    if (value == null) return $("at.inlay.Missing", { path });
    return value;
  };
}

export function resolvePath(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const seg of path) {
    if (current == null) {
      return undefined;
    }
    if (typeof current === "string") {
      if (seg === "$did" || seg === "$collection" || seg === "$rkey") {
        if (!current.startsWith("at://")) {
          return undefined;
        }
        try {
          const parsed = new AtUri(current);
          if (seg === "$did") {
            ensureValidDid(parsed.host);
            current = parsed.host;
          } else if (seg === "$collection") {
            current = parsed.collection;
          } else if (seg === "$rkey") {
            current = parsed.rkey;
          } else {
            return undefined;
          }
        } catch {
          return undefined;
        }
        continue;
      }
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    if (!Object.hasOwn(current, seg)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

// --- Internals ---

async function renderComponent(
  resolver: Resolver,
  component: ComponentRecord,
  componentUri: string | undefined,
  element: Element,
  props: Record<string, unknown>,
  ctx: RenderContext,
): Promise<RenderResult> {
  const depth = ctx.depth ?? 0;
  const type = element.type;

  let resolvedProps = props;
  if (component.view) {
    resolvedProps = expandBareDid(resolvedProps, component.view);
  }

  resolvedProps = await validateProps(type, resolvedProps, component, resolver);

  // Primitive: no body, host renders directly
  if (!component.body) {
    return {
      node: null,
      context: {
        imports: component.imports?.length ? component.imports : ctx.imports,
        depth,
        scope: ctx.scope,
        stack: ctx.stack,
      },
      props: resolvedProps,
    };
  }

  if (component.body.$type === "at.inlay.component#bodyTemplate") {
    return renderTemplate(resolver, component, type, resolvedProps, ctx);
  }

  if (component.body.$type === "at.inlay.component#bodyExternal") {
    return renderExternal(
      resolver,
      type,
      component,
      componentUri,
      resolvedProps,
      ctx,
    );
  }

  throw new Error(`Unknown body type: ${component.body.$type}`);
}

async function resolveType(
  nsid: string,
  importStack: DidString[],
  resolver: Resolver,
): Promise<{
  componentUri: string;
  component: ComponentRecord;
}> {
  const result = await resolver.resolve(
    importStack,
    "at.inlay.component",
    nsid,
  );
  if (!result) throw new Error(`Unresolved type: ${nsid}`);
  return {
    componentUri: result.uri,
    component: result.record as ComponentRecord,
  };
}

/**
 * Resolve an endpoint NSID through the import stack.
 * Walks DIDs looking for `at.inlay.endpoint/{nsid}` records.
 * Returns the service DID from the first matching record.
 */
export async function resolveEndpoint(
  nsid: string,
  imports: DidString[],
  resolver: Resolver,
): Promise<{ did: string; endpointUri: string }> {
  const result = await resolver.resolve(imports, "at.inlay.endpoint", nsid);
  if (!result) throw new Error(`Unresolved endpoint: ${nsid}`);
  const record = result.record as EndpointRecord;
  if (!record.did) throw new Error(`Endpoint record missing did: ${nsid}`);
  return { did: record.did, endpointUri: result.uri };
}

async function renderTemplate(
  resolver: Resolver,
  component: ComponentRecord,
  type: string,
  props: Record<string, unknown>,
  ctx: RenderContext,
): Promise<RenderResult> {
  const body = component.body as { $type: string; node: unknown };
  const depth = ctx.depth ?? 0;
  // Push this component onto the owner stack — it creates child elements.
  const stack = [type, ...(ctx.stack ?? [])];

  const tree = deserializeTree(body.node);

  // Replace caller-provided elements with Slots so they resolve through the
  // caller's imports, not the component's — same isolation as external slots.
  // Slot elements get the caller's context (ctx.stack, before we pushed).
  const callerCtx: RenderContext = {
    imports: ctx.imports,
    depth,
    scope: ctx.scope,
    stack: ctx.stack,
  };
  const slottedProps = walkTree(props, (obj, walk) => {
    if (isValidElement(obj)) {
      slotContexts.set(obj, callerCtx);
      return obj;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
    return out;
  }) as Record<string, unknown>;

  let scope: Record<string, unknown> = { props: slottedProps };
  let cache: CachePolicy | undefined;

  // Find a matching viewRecord and resolve its AT URI prop
  if (component.view) {
    const { prop, accepts } = component.view;
    const viewRecords = accepts.filter((v) => viewRecordSchema.isTypeOf(v));

    for (const vr of viewRecords) {
      const uri = props[prop] as string | undefined;
      if (!uri || !uri.startsWith("at://")) {
        continue;
      }
      const parsed = new AtUri(uri);
      ensureValidNsid(parsed.collection);
      if (!parsed.collection || !parsed.rkey) {
        continue;
      }
      if (vr.collection && vr.collection !== parsed.collection) {
        continue;
      }
      const built = await buildRecord(
        parsed.host,
        parsed.collection,
        parsed.rkey,
        tree,
        resolver,
      );
      scope = { props: slottedProps, record: built.record };
      cache = built.cache;
      break;
    }
  }

  const node = resolveBindings(tree, scopeResolver(scope));
  return {
    node,
    context: {
      imports: component.imports ?? [],
      depth: depth + 1,
      scope,
      stack,
    },
    props,
    cache,
  };
}

async function buildRecord(
  did: AtIdentifierString,
  collection: NsidString,
  rkey: string,
  tree: unknown,
  resolver: Resolver,
): Promise<{ record: Record<string, unknown>; cache?: CachePolicy }> {
  const recordUri: AtUriString = `at://${did}/${collection}/${rkey}`;

  // Skip record fetch if no bindings reference record.*
  if (tree && !needsRecord(tree)) {
    return { record: {} };
  }

  const fetched = await resolver.fetchRecord(recordUri);
  if (fetched && typeof fetched === "object") {
    return {
      record: fetched as Record<string, unknown>,
      cache: {
        tags: [{ $type: "at.inlay.defs#tagRecord", uri: recordUri }],
      },
    };
  }
  return { record: {} };
}

/** Check if any Binding in the deserialized tree references record.* */
function needsRecord(tree: unknown): boolean {
  let found = false;
  walkTree(tree, (obj, walk) => {
    if (isValidElement(obj)) {
      const el = obj as Element;
      if (el.type === "at.inlay.Binding") {
        const path = (el.props as Record<string, unknown>)?.path;
        if (Array.isArray(path) && path[0] === "record") {
          found = true;
        }
        return obj;
      }
    }
    for (const v of Object.values(obj)) walk(v);
    return obj;
  });
  return found;
}

async function renderExternal(
  resolver: Resolver,
  type: string,
  component: ComponentRecord,
  componentUri: string | undefined,
  props: Record<string, unknown>,
  ctx: RenderContext,
): Promise<RenderResult> {
  const body = component.body as {
    $type: string;
    did: string;
    personalized?: boolean;
  };
  const depth = ctx.depth ?? 0;
  // Push this component onto the owner stack — it creates child elements.
  const stack = [type, ...(ctx.stack ?? [])];

  // Replace child elements with Slot references for wire transport
  const refs = new Map<string, unknown>();
  const refSlots = new Set<object>();
  const wireProps = serializeTree(props, (el) => {
    if (el.type === "at.inlay.Slot") {
      if (refSlots.has(el)) {
        return el;
      }
      throw new Error("Unexpected Slot in props");
    }
    const id = String(refs.size);
    refs.set(id, el);
    const slot = $("at.inlay.Slot", { id });
    refSlots.add(slot);
    return slot;
  });

  const response = (await resolver.xrpc({
    did: body.did,
    nsid: type,
    type: "procedure",
    body: wireProps as Record<string, unknown>,
    componentUri,
    personalized: body.personalized ?? false,
  })) as { node: unknown; cache?: CachePolicy };

  // Restore slots — register caller context in the WeakMap.
  // Slot elements get the caller's context (ctx.stack, before we pushed).
  const callerCtx: RenderContext = {
    imports: ctx.imports,
    depth,
    scope: ctx.scope,
    stack: ctx.stack,
  };

  const node = deserializeTree(response.node, (el) => {
    if (el.type === "at.inlay.Slot" && el.props) {
      const id = (el.props as Record<string, unknown>).id as string;
      const original = refs.get(id);
      if (original === undefined) {
        throw new Error(`${type}: XRPC response references unknown slot ${id}`);
      }
      const orig = original as Element;
      const restored = $(orig.type, {
        ...orig.props,
        key: el.key,
      });
      const frag = $("at.inlay.Fragment", {
        key: orig.key,
        children: restored,
      });
      slotContexts.set(frag, callerCtx);
      return frag as Element;
    }
    return el;
  });

  return {
    node,
    context: {
      imports: component.imports ?? [],
      depth: depth + 1,
      stack,
    },
    props,
    cache: response.cache,
  };
}

function expandBareDid(
  props: Record<string, unknown>,
  view: View,
): Record<string, unknown> {
  const { prop, accepts } = view;

  // Find the first viewRecord with both collection and rkey — that enables DID expansion
  const entry = accepts
    .filter((v) => viewRecordSchema.isTypeOf(v))
    .find((v) => v.collection && v.rkey);
  if (!entry) {
    return props;
  }
  const value = props[prop] as string | undefined;
  if (!value || !value.startsWith("did:")) {
    return props;
  }

  return {
    ...props,
    [prop]: `at://${value}/${entry.collection}/${entry.rkey}`,
  };
}
