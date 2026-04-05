import { AtUri, AtUriString } from "@atproto/syntax";
import { $ } from "@inlay/core";
import type { ComponentRecord } from "@inlay/render";
import type { BuildAction } from "remix/fetch-router";

import {
  setComponentUri,
  setQueryString,
  setRecordUri,
} from "../../inlay/primitives.tsx";
import {
  createContext,
  createRenderOptions,
  initRender,
  renderNode,
} from "../../inlay/render.tsx";
import { createResolver } from "../../inlay/resolver.ts";
import { routes } from "../../routes.ts";
import { render } from "../../utils/render.ts";

const resolver = createResolver();
const renderOptions = createRenderOptions(resolver);
initRender(renderOptions);

export const componentAction = {
  async handler(context) {
    const { did, collection, rkey } = context.params;
    const componentUri = context.url.searchParams.get("componentUri");

    if (!componentUri) {
      return render(
        <p style={{ color: "red", fontSize: 24, margin: 0 }}>
          No componentUri provided
        </p>,
        {
          request: context.request,
          router: context.router,
        },
      );
    }

    const c = context;

    try {
      const component = await resolver.fetchRecord(componentUri as AtUriString);
      if (!component) {
        return render(
          <div>Component not found: {componentUri}</div>,
        );
      }

      const componentRecord = component as ComponentRecord;
      const uri = `at://${did}/${collection}/${rkey}`;
      const qs = new URL(c.request.url);
      qs.searchParams.delete("childNsid");
      setQueryString(qs.search.slice(1));
      setRecordUri(uri);
      setComponentUri(componentUri);
      // When a childNsid param is present, render just that child component
      // (used by the Loading primitive to stream deferred tab content).
      const childNsid = c.url.searchParams.get("childNsid");
      let element;
      let ctx;
      if (childNsid) {
        const childComponentUri = `at://${
          new AtUri(componentUri).host
        }/at.inlay.component/${childNsid}` as AtUriString;
        const childComponent = await resolver.fetchRecord(childComponentUri);
        if (!childComponent) {
          return render(
            <div class="error">Child component not found: {childNsid}</div>,
            { request: c.request, router: c.router },
          );
        }
        element = $(childNsid, { uri });
        ctx = createContext(
          childComponent as ComponentRecord,
          childComponentUri,
        );
      } else {
        const nsid = new AtUri(componentUri).rkey;
        element = $(nsid, { uri });
        ctx = createContext(componentRecord, componentUri);
      }

      const body = await renderNode(element, ctx, renderOptions);

      const wrapped = <at-inlay-root>{body}</at-inlay-root>;

      return render(wrapped, {
        request: c.request,
        router: c.router,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return render(
        <div class="error">Render error: {msg}</div>,
        {
          request: context.request,
          router: context.router,
        },
      );
    }
  },
} satisfies BuildAction<"GET", typeof routes.inlay.component>;
