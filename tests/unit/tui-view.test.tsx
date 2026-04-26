import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 120;
    rows = 32;
    options: { theme?: unknown } = {};
    loadAddon() {}
    open() {}
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
});
