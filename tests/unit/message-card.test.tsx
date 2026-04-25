import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageCard } from "../../src/surfaces/components/MessageCard";

describe("MessageCard", () => {
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

  it("shows collapsed thinking preview and expands on click", () => {
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
    expect(screen.getByText(/This is the full thinking text with more detail/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand thinking" }));

    expect(screen.getByRole("button", { name: "Collapse thinking" })).toBeInTheDocument();
    expect(screen.getByText("This is the full thinking text with more detail than the compact preview should show at once.")).toBeInTheDocument();
  });
});
