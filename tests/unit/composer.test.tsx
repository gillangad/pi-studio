import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../../src/surfaces/components/Composer";

describe("Composer", () => {
  it("submits on Enter and keeps Shift+Enter for newlines", () => {
    const onSubmit = vi.fn();

    render(
      <Composer
        busy={false}
        value="/model"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        onAbort={() => undefined}
        models={[]}
        currentModel={null}
        thinkingLevel="medium"
        availableThinkingLevels={["off", "medium", "high"]}
        attachments={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText("Ask for follow-up changes");

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows Send immediately after clicking Stop", () => {
    const onAbort = vi.fn();

    render(
      <Composer
        busy={true}
        value="hello"
        onValueChange={() => {}}
        onSubmit={() => {}}
        onAbort={onAbort}
        models={[]}
        currentModel={null}
        thinkingLevel="medium"
        availableThinkingLevels={["off", "medium", "high"]}
        attachments={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("lets you select provider and model from the footer model menu", () => {
    const onSetModel = vi.fn();

    render(
      <Composer
        busy={false}
        value="hello"
        onValueChange={() => {}}
        onSubmit={() => {}}
        onAbort={() => undefined}
        models={[
          { provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true },
          { provider: "anthropic", id: "claude-opus-4", name: "Claude Opus 4", reasoning: true },
        ]}
        currentModel={{ provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true }}
        thinkingLevel="medium"
        availableThinkingLevels={[
          "off",
          "medium",
          "high",
        ]}
        attachments={[]}
        onSetModel={onSetModel}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "openai GPT-5 medium" }));

    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), {
      target: { value: "anthropic" },
    });

    expect(onSetModel).toHaveBeenCalledWith("anthropic", "claude-opus-4");
  });

  it("keeps the composer textarea transparent inside the surfaced shell", () => {
    render(
      <Composer
        busy={false}
        value="hello"
        onValueChange={() => {}}
        onSubmit={() => {}}
        onAbort={() => undefined}
        models={[]}
        currentModel={null}
        thinkingLevel="medium"
        availableThinkingLevels={["off", "medium", "high"]}
        attachments={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText("Ask for follow-up changes");
    expect(input.className).toContain("bg-transparent");
    expect(input.className).toContain("border-transparent");
  });

  it("uses the plus button for attachments", () => {
    const onPickAttachments = vi.fn();

    render(
      <Composer
        busy={false}
        value=""
        onValueChange={() => {}}
        onSubmit={() => {}}
        onAbort={() => undefined}
        models={[]}
        currentModel={null}
        thinkingLevel="medium"
        availableThinkingLevels={["off", "medium", "high"]}
        attachments={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={onPickAttachments}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));

    expect(onPickAttachments).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Attach" })).not.toBeInTheDocument();
  });
});
