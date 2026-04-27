import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 120;
    rows = 32;
    options: { theme?: unknown } = {};
    loadAddon() {}
    open(element: HTMLElement) {
      const viewport = document.createElement("div");
      viewport.className = "xterm-viewport";
      Object.defineProperty(viewport, "clientHeight", {
        configurable: true,
        value: 100,
      });
      Object.defineProperty(viewport, "scrollHeight", {
        configurable: true,
        value: 400,
      });
      Object.defineProperty(viewport, "scrollTop", {
        configurable: true,
        writable: true,
        value: 0,
      });

      const screen = document.createElement("div");
      screen.className = "xterm-screen";
      element.appendChild(viewport);
      element.appendChild(screen);
    }
    onData() {
      return { dispose() {} };
    }
    write() {}
    dispose() {}
    scrollToBottom() {}
    focus() {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

if (!("ResizeObserver" in globalThis)) {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  });
}

import { TuiView } from "../../src/surfaces/components/TuiView";

describe("TuiView", () => {
  it("renders as a flat workspace surface", () => {
    render(
      <TuiView
        tui={{
          active: true,
          projectId: "p1",
          cwd: "/tmp/demo",
          status: "running",
          errorText: null,
          runningInBackground: false,
        }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onResize={vi.fn()}
        onData={vi.fn()}
        subscribeToData={() => () => {}}
      />,
    );

    const shell = screen.getByLabelText("Hosted terminal");
    expect(shell.className).not.toContain("rounded-xl");
    expect(shell.className).not.toContain("border");
    expect(shell.className).toContain("bg-background");
  });

  it("forwards wheel scrolling into the xterm viewport", () => {
    render(
      <TuiView
        tui={{
          active: true,
          projectId: "p1",
          cwd: "/tmp/demo",
          status: "running",
          errorText: null,
          runningInBackground: false,
        }}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onResize={vi.fn()}
        onData={vi.fn()}
        subscribeToData={() => () => {}}
      />,
    );

    const hostedTerminal = screen.getByLabelText("Hosted terminal");
    const viewport = hostedTerminal.querySelector(".xterm-viewport") as HTMLDivElement | null;
    const screenSurface = hostedTerminal.querySelector(".xterm-screen") as HTMLDivElement | null;

    expect(viewport).not.toBeNull();
    expect(screenSurface).not.toBeNull();

    fireEvent.wheel(screenSurface!, { deltaY: 120 });

    expect(viewport!.scrollTop).toBe(120);
  });
});
