import type { BuildAction } from "remix/fetch-router";

import { Canvas } from "../assets/canvas.tsx";
import { fetchRecordFromPds } from "../inlay/resolver.ts";
import type { CanvasRecord } from "../inlay/types.ts";
import { routes } from "../routes.ts";
import { Document } from "../ui/document.tsx";
import { render } from "../utils/render.ts";

export const canvasAction = {
  async handler(context) {
    const { atUri } = context.params;

    const canvasRecord = await fetchRecordFromPds(
      atUri,
    ) as CanvasRecord;

    return render(
      <InlayPage
        windows={canvasRecord.windows}
      />,
      {
        request: context.request,
        router: context.router,
      },
    );
  },
} satisfies BuildAction<"GET", typeof routes.canvas>;

function InlayPage() {
  return (
    { windows }: {
      windows: CanvasRecord["windows"];
    },
  ) => (
    <Document title={`canvas`}>
      <Canvas
        windows={windows}
      />
    </Document>
  );
}
