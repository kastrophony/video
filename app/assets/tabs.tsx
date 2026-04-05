import type { RemixNode } from "remix/component";
import {
  clientEntry,
  type Handle,
  on,
  pressEvents,
  ref,
} from "remix/component";

import { routes } from "../routes.ts";

type TabItem = { key: string; label: string };

type TabsSetup = { items: TabItem[] };
type TabsProps = { children?: RemixNode };

export const Tabs = clientEntry(
  routes.assets.href({ path: "tabs.js#Tabs" }),
  (handle: Handle, setup: TabsSetup) => {
    const { items } = setup;
    let activeIndex = 0;
    let hostEl: HTMLElement | null = null;

    function applyPanels() {
      if (!hostEl) return;
      hostEl
        .querySelectorAll<HTMLElement>("[data-tab]")
        .forEach((panel, i) => {
          panel.hidden = i !== activeIndex;
        });
    }

    return ({ children }: TabsProps) => (
      <org-atsui-tabs
        mix={[
          ref((el) => {
            hostEl = el as HTMLElement;
            applyPanels();
          }),
        ]}
      >
        <div class="tabs-bar" role="tablist">
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={i === activeIndex ? "true" : "false"}
              mix={[
                pressEvents(),
                on(pressEvents.press, () => {
                  activeIndex = i;
                  applyPanels();
                  handle.update();
                }),
              ]}
            >
              {item.label}
            </button>
          ))}
        </div>
        {children}
      </org-atsui-tabs>
    );
  },
);
