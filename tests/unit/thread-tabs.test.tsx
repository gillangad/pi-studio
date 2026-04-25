import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadTabs } from "../../src/surfaces/components/ThreadTabs";

describe("ThreadTabs", () => {
  it("activates and closes tabs", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();

    render(
      <ThreadTabs
        tabs={[
          { projectId: "p1", sessionFile: "/tmp/a.jsonl", title: "Thread A", isActive: true },
          { projectId: "p2", sessionFile: "/tmp/b.jsonl", title: "Thread B", isActive: false },
        ]}
        onActivate={onActivate}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Thread B" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Thread A" }));

    expect(onActivate).toHaveBeenCalledWith("p2", "/tmp/b.jsonl");
    expect(onClose).toHaveBeenCalledWith("p1", "/tmp/a.jsonl");
  });
});
