import { run } from "remix/component";

const app = run({
  async loadModule(moduleUrl, exportName) {
    const mod = await import(moduleUrl);
    const exp = mod[exportName];
    if (typeof exp !== "function") {
      throw new Error(
        `Export "${exportName}" from "${moduleUrl}" is not a function`,
      );
    }
    return exp;
  },
  async resolveFrame(src, signal) {
    const res = await fetch(src, { headers: { accept: "text/html" }, signal });
    if (!res.ok) {
      return `<pre>Frame error: ${res.status} ${res.statusText}</pre>`;
    }
    if (res.body) return res.body;
    return await res.text();
  },
});

app.ready().catch((error: unknown) => console.error(error));
