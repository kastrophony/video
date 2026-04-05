import { isValidElement } from "@inlay/core";
import {
  createContext,
  MissingError,
  type NsidString,
  render,
  type RenderContext,
  type RenderOptions,
  type Resolver,
} from "@inlay/render";
import { createElement, type RemixNode } from "remix/component";

import { componentMap, setRenderNode, setResolver } from "./primitives.tsx";
import "./types.ts";

type Element = { type: string; key?: string; props?: Record<string, unknown> };

export { createContext };
export type { RenderContext };

export function createRenderOptions(resolver: Resolver): RenderOptions {
  return {
    resolver,
    builtins: new Set(Object.keys(componentMap)) as Set<NsidString>,
  };
}

export async function renderNode(
  node: unknown,
  context: RenderContext,
  options: RenderOptions,
): Promise<RemixNode> {
  if (node == null) return <></>;
  if (Array.isArray(node)) {
    const parts = await Promise.all(
      node.map((child) => renderNode(child, context, options)),
    );
    return <>{parts}</>;
  }
  if (typeof node === "string") return <>{node}</>;
  if (typeof node === "number") return <>{String(node)}</>;
  if (typeof node === "boolean") return <></>;
  if (isValidElement(node)) {
    return renderElement(node as Element, context, options);
  }
  return <>{String(node)}</>;
}

async function renderElement(
  element: Element,
  context: RenderContext,
  options: RenderOptions,
): Promise<RemixNode> {
  let result;
  try {
    result = await render(
      element as Parameters<typeof render>[0],
      context,
      options,
    );
  } catch (e) {
    if (e instanceof MissingError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return <div class="error">{msg}</div>;
  }

  // Primitive or builtin: node is null, host renders directly
  if (result.node === null) {
    const Builtin = componentMap[element.type];
    if (Builtin) {
      return Builtin({ ctx: result.context, props: result.props });
    }
    return <div class="error">Unknown primitive: {element.type}</div>;
  }

  const tag = element.type.toLowerCase().replaceAll(".", "-");
  const inner = await renderNode(result.node, result.context, options);
  return <>{createElement(tag, { style: "display:contents" }, inner)}</>;
}

export function initRender(options: RenderOptions) {
  setRenderNode((node, ctx) => renderNode(node, ctx, options));
  setResolver(options.resolver);
}
