import {
  clientEntry,
  css,
  Frame,
  type Handle,
  ref,
  type RemixNode,
} from "remix/component";

import { routes } from "../routes.ts";

type InfiniteScrollSetup = {
  nextUrl: string | null;
};

type InfiniteScrollProps = {
  children?: RemixNode;
};

export const InfiniteScroll = clientEntry(
  routes.assets.href({ path: "infinite-scroll.js#InfiniteScroll" }),
  (handle: Handle, setup: InfiniteScrollSetup) => {
    const pageUrls: string[] = [];
    let nextUrl: string | null = setup.nextUrl;
    let lastFrameSettled = true;
    let sentinelVisible = false;

    function onFrameSettled(frameEl: Element) {
      nextUrl = frameEl.getAttribute("data-next-url");
      lastFrameSettled = true;
      if (sentinelVisible) {
        loadNextPage();
      } else {
        handle.update();
      }
    }

    function watchFrameContainer(el: Element, signal: AbortSignal) {
      function trySettle(): boolean {
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          if (child.hasAttribute("data-list-page")) {
            onFrameSettled(child);
            return true;
          }
        }
        return false;
      }
      if (trySettle()) return;
      const mo = new MutationObserver(() => {
        if (trySettle()) mo.disconnect();
      });
      mo.observe(el, { childList: true, subtree: false });
      signal.addEventListener("abort", () => mo.disconnect());
    }

    function loadNextPage() {
      if (!nextUrl || !lastFrameSettled) return;
      pageUrls.push(nextUrl);
      nextUrl = null;
      lastFrameSettled = false;
      handle.update();
    }

    return ({ children }: InfiniteScrollProps) => {
      const showSentinel =
        !!(nextUrl || (!lastFrameSettled && pageUrls.length > 0));

      return (
        <div
          mix={css({
            "[data-list-page]": {
              display: "contents",
            },
          })}
        >
          {children}
          {pageUrls.map((url) => (
            <div
              key={url}
              mix={[
                css({
                  "[data-list-page]": {
                    display: "contents",
                  },
                }),
                ref((el, signal) => {
                  watchFrameContainer(el, signal);
                }),
              ]}
            >
              <Frame
                src={url}
                fallback={<div class="list-loading">Loading...</div>}
              />
            </div>
          ))}
          {showSentinel && (
            <div
              mix={[
                css({
                  padding: "20px",
                  textAlign: "center",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                }),
                ref((el, signal) => {
                  const io = new IntersectionObserver(
                    (entries) => {
                      const visible = entries[0]?.isIntersecting ?? false;
                      sentinelVisible = visible;
                      if (sentinelVisible) loadNextPage();
                    },
                    { rootMargin: "100px" },
                  );
                  io.observe(el);
                  signal.addEventListener("abort", () => {
                    sentinelVisible = false;
                    io.disconnect();
                  });
                }),
              ]}
            />
          )}
        </div>
      );
    };
  },
);
