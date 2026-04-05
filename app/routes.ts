import { route } from "remix/fetch-router/routes";

export const routes = route({
  assets: "/assets/*path",

  index: "/",
  app: "/at/:did/:collection/:rkey",

  inlay: route("inlay", {
    component: "/:did/:collection/:rkey",
    list: "/list",
  }),
});
