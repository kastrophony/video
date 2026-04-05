import { Frame } from "remix/component";
import type { BuildAction } from "remix/fetch-router";

import { routes } from "../routes.ts";
import { Document } from "../ui/document.tsx";
import { render } from "../utils/render.ts";

export const appAction = {
  handler(context) {
    const { did, collection, rkey } = context.params;
    const componentUri = context.url.searchParams.get("componentUri");

    return render(
      <InlayPage
        did={did}
        collection={collection}
        rkey={rkey}
        componentUri={componentUri}
      />,
      {
        request: context.request,
        router: context.router,
      },
    );
  },
} satisfies BuildAction<"GET", typeof routes.app>;

function InlayPage() {
  return (
    { did, collection, rkey, componentUri }: {
      did: string;
      collection: string;
      rkey: string;
      componentUri: string | null;
    },
  ) => (
    <Document title={`at://${did}/${collection}/${rkey}`}>
      <h1>Inlay Components</h1>
      <Frame
        src={routes.inlay.component.href({ did, collection, rkey }, {
          componentUri,
        })}
        fallback={<p>{new Date().toLocaleTimeString()}</p>}
      />
    </Document>
  );
}
