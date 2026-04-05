import type { RemixNode } from "remix/component";

type DocumentProps = {
  title: string;
  children?: RemixNode;
};

export function Document() {
  return ({ title, children }: DocumentProps) => (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <script async type="module" src="/assets/entry.js" />
        <link rel="stylesheet" href="/host-primitives.css" />
        <link rel="stylesheet" href="/host-theme.css" />
      </head>
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji",
          margin: 0,
          padding: 24,
        }}
      >
        <div style={{ maxWidth: "760px", margin: "0 auto" }}>{children}</div>
        <div style={{ opacity: 0, height: 0 }}>
          {/*I'm a safari hack 😵‍💫 fixes naturally when app page has more content*/}
          {/*Safari buffers all streamed responses because the initial page is too minimal*/}
          {".".repeat(3000)}
        </div>
      </body>
    </html>
  );
}
