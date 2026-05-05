import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageCard } from "../../src/surfaces/components/MessageCard";

describe("MessageCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders user messages as compact right-aligned bubbles", () => {
    const { container } = render(
      <MessageCard
        message={{
          id: "u1",
          role: "user",
          content: ["hello there"],
          timestamp: "2026-05-05T16:28:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("ml-auto");
    expect(container.firstElementChild).toHaveClass("w-fit");
    expect(container.querySelector(".message-user-bubble")).toBeTruthy();
    expect(container.firstElementChild).not.toHaveClass("w-full");
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });

  it("renders markdown content in assistant messages", () => {
    render(
      <MessageCard
        message={{
          id: "m1",
          role: "assistant",
          content: ["# Heading\n\n- first item\n- second item\n\n```ts\nconst answer = 42;\n```"],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Heading", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("first item")).toBeInTheDocument();
    expect(screen.getByText("const answer = 42;")).toBeInTheDocument();
  });

  it("shows a collapsed thinking label and reveals text on click", () => {
    render(
      <MessageCard
        message={{
          id: "m2",
          role: "assistant",
          content: ["Done"],
          thinkingContent: ["This is the full thinking text with more detail than the compact preview should show at once."],
        }}
      />,
    );

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand thinking" })).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.queryByText(/This is the full thinking text with more detail/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand thinking" }));

    expect(screen.getByRole("button", { name: "Collapse thinking" })).toBeInTheDocument();
    expect(screen.getByText("This is the full thinking text with more detail than the compact preview should show at once.")).toBeInTheDocument();
  });

  it("renders inline artifact cards that open the latest revision", () => {
    const onOpenArtifact = vi.fn();

    render(
      <MessageCard
        message={{
          id: "m3",
          role: "assistant",
          content: ["I built the report view."],
          artifactRefs: [{ artifactId: "report", title: "Quarterly Report", kind: "react-tsx" }],
        }}
        artifactById={{
          report: {
            artifactId: "report",
            title: "Quarterly Report",
            summary: "Revenue and margin explorer",
            kind: "react-tsx",
            tsx: "export default function ArtifactApp() { return <main />; }",
            html: null,
            css: "",
            js: "",
            data: null,
            createdInMessageId: "m1",
            updatedInMessageId: "m4",
            createdAt: 1,
            updatedAt: 4,
            revisionCount: 3,
            updatedSequence: 3,
          },
        }}
        onOpenArtifact={onOpenArtifact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open artifact Quarterly Report" }));

    expect(screen.getByText("Revenue and margin explorer")).toBeInTheDocument();
    expect(screen.getByText("Opens latest update")).toBeInTheDocument();
    expect(onOpenArtifact).toHaveBeenCalledWith("report");
  });

  it("copies assistant message text from the hover footer action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(globalThis.navigator, {
      clipboard: { writeText },
    });

    render(
      <MessageCard
        message={{
          id: "m4",
          role: "assistant",
          content: ["Copied body"],
          timestamp: 1714926480000,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(writeText).toHaveBeenCalledWith("Copied body");
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });
});
