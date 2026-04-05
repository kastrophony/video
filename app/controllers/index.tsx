import { redirect } from "remix/response/redirect";
import { routes } from "../routes.ts";
import { BuildAction } from "remix/fetch-router";

export const indexAction = {
  handler() {
    return redirect(routes.app.href({
      did: "did:plc:rcjhtxh5v4mwvrbezap3hixf",
      collection: "app.bsky.actor.profile",
      rkey: "self",
    }, {
      componentUri:
        "at://did:plc:fpruhuo22xkm5o7ttr2ktxdo/at.inlay.component/mov.danabra.Profile",
    }));
  },
} satisfies BuildAction<"GET", typeof routes.index>;
