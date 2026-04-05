import { redirect } from "remix/response/redirect";
import { BuildAction } from "remix/fetch-router";

import { routes } from "../routes.ts";

export const indexAction = {
  handler() {
    const did = "did:plc:rcjhtxh5v4mwvrbezap3hixf";
    const collection = "app.bsky.actor.profile";
    const rkey = "self";

    return redirect(routes.app.href({
      atUri: `at://${did}/${collection}/${rkey}`,
    }, {
      componentUri:
        "at://did:plc:fpruhuo22xkm5o7ttr2ktxdo/at.inlay.component/mov.danabra.Profile",
    }));
  },
} satisfies BuildAction<"GET", typeof routes.index>;
