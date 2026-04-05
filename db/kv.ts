import process from "node:process";
import { fileURLToPath } from "node:url";

const path = process.env.NODE_ENV === "development"
  ? fileURLToPath(new URL("db.sqlite", import.meta.url))
  : undefined;

export const db = await Deno.openKv(path);
