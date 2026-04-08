import process from "node:process";
import { createRouter } from "remix/fetch-router";
import { logger } from "remix/logger-middleware";
import { staticFiles } from "remix/static-middleware";

import { appAction } from "./controllers/app.tsx";
import { componentAction } from "./controllers/inlay/component.tsx";
import { listAction } from "./controllers/inlay/list.tsx";
import { routes } from "./routes.ts";
import { indexAction } from "./controllers/index.tsx";
import { canvasAction } from "./controllers/canvas.tsx";

const middleware = [];

if (process.env.NODE_ENV === "development") {
  middleware.push(logger());
}

middleware.push(
  staticFiles("./public", {
    cacheControl: "no-store",
    etag: false,
    lastModified: false,
    index: false,
  }),
);

export const router = createRouter({ middleware });
router.get(routes.index, indexAction);
router.get(routes.app, appAction);
router.get(routes.canvas, canvasAction);
router.get(routes.inlay.component, componentAction);
router.get(routes.inlay.list, listAction);
