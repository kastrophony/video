import { clientEntry, Frame, type Handle, on } from "remix/component";

import type { CanvasWindow } from "../inlay/types.ts";
import { routes } from "../routes.ts";
import { Skeleton } from "../ui/skeleton.tsx";

const MIN_WIDTH = 120;
const MIN_HEIGHT = 80;

export const Canvas = clientEntry(
  routes.assets.href({ path: "canvas.js#Canvas" }),
  (handle: Handle) => {
    type Pos = { x: number; y: number; z: number };
    type Size = { width: number; height: number };
    type DragState = {
      kind: "move";
      pointerId: number;
      startX: number;
      startY: number;
      startLeft: number;
      startTop: number;
    } | {
      kind: "resize";
      pointerId: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    };

    const positions = new Map<string, Pos>();
    const sizes = new Map<string, Size>();
    const dragStates = new Map<string, DragState>();
    let maxZ = 0;
    let initialized = false;

    handle.signal.addEventListener("abort", () => {
      globalThis.removeEventListener("pointermove", onPointerMove);
      globalThis.removeEventListener("pointerup", onPointerDone);
      globalThis.removeEventListener("pointercancel", onPointerDone);
    });

    function onPointerMove(event: PointerEvent) {
      for (const [id, drag] of dragStates) {
        if (drag.pointerId !== event.pointerId) continue;
        if (drag.kind === "move") {
          const pos = positions.get(id)!;
          pos.x = drag.startLeft + (event.clientX - drag.startX);
          pos.y = drag.startTop + (event.clientY - drag.startY);
        } else {
          const size = sizes.get(id)!;
          size.width = Math.max(
            MIN_WIDTH,
            drag.startWidth + (event.clientX - drag.startX),
          );
          size.height = Math.max(
            MIN_HEIGHT,
            drag.startHeight + (event.clientY - drag.startY),
          );
        }
        void handle.update();
        break;
      }
    }

    function onPointerDone(event: PointerEvent) {
      for (const [id, drag] of dragStates) {
        if (drag.pointerId !== event.pointerId) continue;
        dragStates.delete(id);
        break;
      }
      if (dragStates.size === 0) {
        globalThis.removeEventListener("pointermove", onPointerMove);
        globalThis.removeEventListener("pointerup", onPointerDone);
        globalThis.removeEventListener("pointercancel", onPointerDone);
      }
      void handle.update();
    }

    function attachGlobalListeners() {
      globalThis.addEventListener("pointermove", onPointerMove);
      globalThis.addEventListener("pointerup", onPointerDone);
      globalThis.addEventListener("pointercancel", onPointerDone);
    }

    function bringToTop(windowId: string) {
      positions.get(windowId)!.z = ++maxZ;
    }

    function startMove(windowId: string, event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      bringToTop(windowId);
      const pos = positions.get(windowId)!;
      dragStates.set(windowId, {
        kind: "move",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: pos.x,
        startTop: pos.y,
      });
      if (dragStates.size === 1) attachGlobalListeners();
      void handle.update();
    }

    function startResize(windowId: string, event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      bringToTop(windowId);
      const size = sizes.get(windowId)!;
      dragStates.set(windowId, {
        kind: "resize",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: size.width,
        startHeight: size.height,
      });
      if (dragStates.size === 1) attachGlobalListeners();
      void handle.update();
    }

    return ({ windows }: { windows: CanvasWindow[] }) => {
      if (!initialized) {
        initialized = true;
        for (const w of windows) {
          positions.set(w.id, { x: w.x, y: w.y, z: w.z });
          sizes.set(w.id, {
            width: w.width ?? 320,
            height: w.height ?? 400,
          });
          if (w.z > maxZ) maxZ = w.z;
        }
      }

      return (
        <div
          style={{
            position: "relative",
            flex: 1,
            overflow: "hidden",
            backgroundColor: "#f5f3ef",
            backgroundImage:
              "radial-gradient(circle, #d4d0c8 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            height: "100%",
          }}
        >
          {windows.map((win) => {
            const pos = positions.get(win.id) ?? {
              x: win.x,
              y: win.y,
              z: win.z,
            };
            const size = sizes.get(win.id) ?? {
              width: win.width ?? 320,
              height: win.height ?? 400,
            };
            const isMoving = dragStates.get(win.id)?.kind === "move";
            const isResizing = dragStates.get(win.id)?.kind === "resize";
            const isActive = isMoving || isResizing;

            return (
              <div
                key={win.id}
                style={{
                  backgroundColor: "white",
                  border: "2px solid #0f0f0f",
                  borderRadius: "6px",
                  boxShadow: isActive
                    ? "8px 8px 0 #0f0f0f"
                    : "4px 4px 0 #0f0f0f",
                  height: size.height,
                  width: size.width,
                  position: "absolute",
                  top: `${pos.y}px`,
                  left: `${pos.x}px`,
                  zIndex: pos.z,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  transition: isActive ? "none" : "box-shadow 0.1s ease",
                }}
              >
                {/* Title bar — drag handle */}
                <div
                  mix={[
                    on(
                      "pointerdown",
                      (event) => startMove(win.id, event as PointerEvent),
                    ),
                  ]}
                  style={{
                    padding: "8px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "bold",
                    flexShrink: 0,
                    cursor: isMoving ? "grabbing" : "grab",
                    userSelect: "none",
                    touchAction: "none",
                  }}
                >
                  {win.componentUri}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <Frame
                    src={routes.inlay.component.href(
                      { atUri: `${win.props.uri}` },
                      { componentUri: win.componentUri },
                    )}
                    fallback={<Skeleton />}
                  />
                </div>

                {/* Resize handle — bottom-right corner */}
                <div
                  mix={[
                    on(
                      "pointerdown",
                      (event) => startResize(win.id, event as PointerEvent),
                    ),
                  ]}
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: "16px",
                    height: "16px",
                    cursor: "nwse-resize",
                    touchAction: "none",
                    // Visual: two diagonal lines in the corner
                    backgroundImage:
                      "linear-gradient(135deg, transparent 50%, #0f0f0f 50%), " +
                      "linear-gradient(135deg, transparent 65%, #0f0f0f 65%)",
                    backgroundSize: "10px 10px, 6px 6px",
                    backgroundPosition: "4px 4px, 8px 8px",
                    backgroundRepeat: "no-repeat",
                    opacity: 0.4,
                  }}
                />
              </div>
            );
          })}
        </div>
      );
    };
  },
);
