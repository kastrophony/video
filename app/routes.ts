import { route } from "remix/fetch-router/routes";

export const routes = route({
  assets: "/assets/*path",

  index: "/",
  app: "/*atUri",
  canvas: "canvas/*atUri",

  inlay: route("inlay", {
    component: "/*atUri",
    list: "/list",
  }),
});
