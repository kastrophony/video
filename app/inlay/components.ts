import { listRecordsFromPds } from "./resolver.ts";

export const COLLECTION_COMPONENTS: Record<string, string> = {
  "place.stream.video":
    "at://did:plc:rcjhtxh5v4mwvrbezap3hixf/at.inlay.component/computer.katherine.StreamPlaceVideo",
  "place.stream.livestream":
    "at://did:plc:rcjhtxh5v4mwvrbezap3hixf/at.inlay.component/computer.katherine.StreamPlaceLiveStream",
  "app.bsky.actor.profile":
    "at://did:plc:fpruhuo22xkm5o7ttr2ktxdo/at.inlay.component/mov.danabra.Profile",
};

const PREFERRED_AUTHORS: string[] = [
  "did:plc:rcjhtxh5v4mwvrbezap3hixf", // katherine.computer
  "did:plc:fpruhuo22xkm5o7ttr2ktxdo", // mov.danabra
];

interface ComponentRecord {
  view?: {
    accepts?: Array<{
      $type: string;
      collection?: string;
      rkey?: string;
    }>;
  };
}

export async function resolveComponentUri(
  collection: string,
): Promise<string | null> {
  if (COLLECTION_COMPONENTS[collection]) {
    return COLLECTION_COMPONENTS[collection];
  }

  for (const did of PREFERRED_AUTHORS) {
    const components = await listRecordsFromPds(did, "at.inlay.component");

    for (const { uri, value } of components) {
      const component = value as ComponentRecord;
      if (!component.view?.accepts) continue;

      const acceptsCollection = component.view.accepts.some(
        (entry) =>
          entry.$type === "at.inlay.component#viewRecord" &&
          entry.collection === collection,
      );

      if (acceptsCollection) {
        return uri;
      }
    }
  }

  return null;
}
