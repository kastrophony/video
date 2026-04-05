import { AtUri } from "@atproto/syntax";
import { Frame } from "remix/component";
import type { BuildAction } from "remix/fetch-router";
import { redirect } from "remix/response/redirect";

import { routes } from "../routes.ts";
import { Document } from "../ui/document.tsx";
import { render } from "../utils/render.ts";

export const appAction = {
  handler(context) {
    const { atUri } = context.params;
    const { did, collection, rkey } = new AtUri(atUri);
    const componentUri = context.url.searchParams.get("componentUri");

    if (!collection || !rkey) {
      const collection = "app.bsky.actor.profile";
      const rkey = "self";

      return redirect(routes.app.href({
        atUri: `at://${did}/${collection}/${rkey}`,
      }, {
        componentUri:
          "at://did:plc:fpruhuo22xkm5o7ttr2ktxdo/at.inlay.component/mov.danabra.Profile",
      }));
    }

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
        src={routes.inlay.component.href({
          atUri: `at://${did}/${collection}/${rkey}`,
        }, {
          componentUri,
        })}
        fallback={<p>{new Date().toLocaleTimeString()}</p>}
      />
    </Document>
  );
}
