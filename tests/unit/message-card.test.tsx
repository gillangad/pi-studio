import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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

  it("shows thinking text above the assistant reply", () => {
    render(
      <MessageCard
        message={{
          id: "m2",
          role: "assistant",
          content: ["Done"],
          thinkingContent: ["This is the full thinking text."],
        }}
      />,
    );

    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("This is the full thinking text.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /thinking/i })).not.toBeInTheDocument();
  });
});
