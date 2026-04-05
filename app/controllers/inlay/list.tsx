import { deserializeTree } from "@inlay/core";
import { resolveEndpoint } from "@inlay/render";
import type { BuildAction } from "remix/fetch-router";
import type { RemixNode } from "remix/component";

import { routes } from "../../routes.ts";
import { render } from "../../utils/render.ts";
import { createResolver } from "../../inlay/resolver.ts";
import {
  createRenderOptions,
  initRender,
  renderNode,
} from "../../inlay/render.tsx";

const resolver = createResolver();
const renderOptions = createRenderOptions(resolver);
initRender(renderOptions);

export const listAction = {
  async handler(context) {
    const query = context.url.searchParams.get("query");
    const cursor = context.url.searchParams.get("cursor");
    const inputStr = context.url.searchParams.get("input");
    const importsStr = context.url.searchParams.get("imports");

    if (!query || !cursor) {
      return render(
        <div class="error">Missing params</div>,
        {
          request: context.request,
          router: context.router,
        },
      );
    }

    try {
      const input = inputStr ? JSON.parse(decodeURIComponent(inputStr)) : {};
      const imports = importsStr
        ? JSON.parse(decodeURIComponent(importsStr))
        : [];

      const ctx = { imports };

      const endpoint = await resolveEndpoint(query, imports, resolver);
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries({ ...input, cursor })) {
        if (v != null) params[k] = String(v);
      }

      const page = (await resolver.xrpc({
        did: endpoint.did,
        nsid: query,
        type: "query",
        params,
      })) as { items: unknown[]; cursor?: string };

      const resolved = await Promise.all(
        page.items.map((item) =>
          renderNode(deserializeTree(item), ctx, renderOptions)
        ),
      );
      const renderedItems: RemixNode[] = [];
      for (let i = 0; i < resolved.length; i++) {
        if (i > 0) renderedItems.push(<hr />);
        renderedItems.push(resolved[i]);
      }

      const importsParam = encodeURIComponent(JSON.stringify(imports));

      const sentinelUrl = page.cursor
        ? routes.inlay.list.href(null, {
          query,
          cursor: page.cursor,
          input: JSON.stringify(input),
          imports: importsParam,
        })
        : null;

      // Wrap items in a root element that carries the next-page URL as a data
      // attribute. InfiniteScroll reads this after the frame renders to know
      // whether another page is available and what URL to request next.
      return render(
        <div data-list-page data-next-url={sentinelUrl ?? undefined}>
          {renderedItems}
        </div>,
        {
          request: context.request,
          router: context.router,
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return render(
        <div class="error">List error: {msg}</div>,
        {
          request: context.request,
          router: context.router,
        },
      );
    }
  },
} satisfies BuildAction<"GET", typeof routes.inlay.list>;
