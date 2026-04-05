import { jsonToLex, type LexiconDoc, Lexicons } from "@atproto/lexicon";
import { AtUri } from "@atproto/syntax";
import { isValidElement, walkTree } from "@inlay/core";
import type { Element } from "@inlay/core";
import type { Main as ComponentRecord } from "../../../generated/at/inlay/component.defs.ts";
import {
  viewPrimitive as viewPrimitiveSchema,
  viewRecord as viewRecordSchema,
} from "../../../generated/at/inlay/component.defs.ts";
import { MissingError, type Resolver } from "./index.ts";

// --- Lexicon cache (module-level) ---

const lexiconCache = new Map<string, Lexicons>();

// --- Prep ---

/**
 * Prepare props for lexicon validation:
 * 1. Throw MissingError for any lingering at.inlay.Missing elements (so Maybe
 *    can catch them) before they hit validation and produce confusing type errors.
 * 2. Hydrate JSON blob refs, CID links, and byte arrays into class instances
 *    (BlobRef, CID, Uint8Array) that @atproto/lexicon validation accepts.
 * Elements are opaque and skipped.
 */
function prepareProps(props: Record<string, unknown>): Record<string, unknown> {
  return walkTree(props, (obj, walk) => {
    if (isValidElement(obj)) {
      if ((obj as Element).type === "at.inlay.Missing") {
        const path = ((obj as Element).props as Record<string, unknown>)?.path;
        throw new MissingError(
          Array.isArray(path) ? (path as string[]) : ["?"],
        );
      }
      return obj;
    }
    if (
      obj["$type"] === "blob" ||
      obj["$link"] !== undefined ||
      obj["$bytes"] !== undefined
    ) {
      return jsonToLex(obj);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
    return out;
  });
}

// --- Public API ---

export async function validateProps(
  type: string,
  props: Record<string, unknown>,
  component: ComponentRecord,
  resolver: Resolver,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> = prepareProps(props);

  const lex = await resolver.resolveLexicon(type);
  if (lex) {
    let lexicons = lexiconCache.get(type);
    if (!lexicons) {
      lexicons = await buildLexicons(lex as Record<string, unknown>, resolver);
      lexiconCache.set(type, lexicons);
    }
    result = lexicons.assertValidXrpcInput(type, result) as Record<
      string,
      unknown
    >;
  } else if (component.view) {
    // Synthesize validation from view entries.
    // viewRecord → validate the view prop is an AT URI string.
    // viewPrimitive → declare the prop exists (required) as unknown.
    //   The primitive type is metadata for editor toolbox matching, not a
    //   runtime constraint — a component accepting strings can also receive
    //   elements, arrays, etc. via JSX children.
    const { prop: viewProp, accepts } = component.view;
    const primitives = accepts.filter((v) => viewPrimitiveSchema.isTypeOf(v));
    const records = accepts.filter((v) => viewRecordSchema.isTypeOf(v));

    if (primitives.length > 0 || records.length > 0) {
      const propEntries = new Map<
        string,
        { type: string; formats: Set<string> }
      >();

      // viewPrimitive entries are NOT added to synthesized validation.
      // The primitive type is metadata for editor toolbox matching; runtime
      // validation of the view prop only applies when viewRecord constrains
      // it to an AT URI string.

      // viewRecord entries imply a string prop (at-uri or did format)
      for (const vr of records) {
        const existing = propEntries.get(viewProp);
        if (existing) {
          existing.formats.add("at-uri");
          if (vr.rkey) existing.formats.add("did");
        } else {
          const formats = new Set<string>(["at-uri"]);
          if (vr.rkey) formats.add("did");
          propEntries.set(viewProp, { type: "string", formats });
        }
      }

      if (propEntries.size > 0) {
        const properties: Record<string, { type: string; format?: string }> =
          {};
        const required = [...propEntries.keys()];
        for (const [prop, { type: t, formats }] of propEntries) {
          const format = unionFormats(formats);
          properties[prop] = format ? { type: t, format } : { type: t };
        }
        const syntheticLex = {
          lexicon: 1,
          id: type,
          defs: {
            main: {
              type: "procedure",
              input: {
                encoding: "application/json",
                schema: { type: "object", required, properties },
              },
            },
          },
        } as unknown as LexiconDoc;
        const lexicons = new Lexicons([syntheticLex]);
        result = lexicons.assertValidXrpcInput(type, result) as Record<
          string,
          unknown
        >;
      }
    }
  }

  // Collection constraint checking from viewRecord entries
  if (component.view) {
    const { prop: collectionProp, accepts } = component.view;
    const records = accepts.filter((v) => viewRecordSchema.isTypeOf(v));
    if (records.length > 0) {
      const allowedCollections = new Map<string, Set<string>>();
      for (const vr of records) {
        if (!vr.collection) {
          continue;
        }
        let set = allowedCollections.get(collectionProp);
        if (!set) {
          set = new Set();
          allowedCollections.set(collectionProp, set);
        }
        set.add(vr.collection);
      }
      for (const [prop, allowed] of allowedCollections) {
        const value = result[prop];
        if (typeof value !== "string" || !value.startsWith("at://")) {
          continue;
        }
        const parsed = new AtUri(value);
        if (!parsed.collection) {
          continue;
        }
        if (!allowed.has(parsed.collection)) {
          throw new Error(
            `${type}: ${prop} expects ${
              [...allowed].join(" or ")
            }, got ${parsed.collection}`,
          );
        }
      }
    }
  }

  return result;
}

// --- Internals ---

const FORMAT_ANCESTORS: Record<string, string[]> = {
  did: ["uri", "at-identifier"],
  "at-uri": ["uri"],
  handle: ["at-identifier"],
};

function unionFormats(formats: Set<string>): string | undefined {
  const arr = [...formats];
  if (arr.length <= 1) {
    return arr[0];
  }
  const ancestorSets = arr.map(
    (f) => new Set([f, ...(FORMAT_ANCESTORS[f] ?? [])]),
  );
  const common = [...ancestorSets[0]].filter((f) =>
    ancestorSets.every((s) => s.has(f))
  );
  if (common.length === 0) {
    return undefined;
  }
  if (common.length === 1) return common[0];
  return common.find(
    (f) =>
      !common.some((g) => g !== f && (FORMAT_ANCESTORS[g] ?? []).includes(f)),
  );
}

function collectRefNsids(obj: unknown, out = new Set<string>()): Set<string> {
  if (!obj || typeof obj !== "object") return out;
  const o = obj as Record<string, unknown>;
  if (o.type === "ref" && typeof o.ref === "string") {
    const nsid = (o.ref as string).split("#")[0];
    if (nsid) out.add(nsid);
  }
  if (o.type === "union" && Array.isArray(o.refs)) {
    for (const ref of o.refs) {
      if (typeof ref === "string") {
        const nsid = ref.split("#")[0];
        if (nsid) out.add(nsid);
      }
    }
  }
  for (const val of Object.values(o)) {
    if (Array.isArray(val)) {
      val.forEach((v) => collectRefNsids(v, out));
    } else if (val && typeof val === "object") {
      collectRefNsids(val, out);
    }
  }
  return out;
}

async function buildLexicons(
  root: Record<string, unknown>,
  resolver: Resolver,
): Promise<Lexicons> {
  const loaded = new Map<string, Record<string, unknown>>();
  loaded.set((root as { id: string }).id, root);

  let pending = collectRefNsids(root);
  while (pending.size > 0) {
    const newNsids = [...pending].filter((nsid) => !loaded.has(nsid));
    if (newNsids.length === 0) break;
    const docs = await Promise.all(
      newNsids.map((nsid) => resolver.resolveLexicon(nsid)),
    );
    const nextPending = new Set<string>();
    for (let i = 0; i < newNsids.length; i++) {
      const doc = docs[i] as Record<string, unknown> | null;
      if (doc) {
        loaded.set(newNsids[i], doc);
        collectRefNsids(doc, nextPending);
      }
    }
    pending = nextPending;
  }

  const docs = [...loaded.values()].map(
    (d) => JSON.parse(JSON.stringify(d)) as LexiconDoc,
  );
  return new Lexicons(docs);
}
