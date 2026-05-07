import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../../src/surfaces/components/Composer";

const DEFAULT_PLACEHOLDER = "Ask Pi to do something";

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
        slashCommands={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText(DEFAULT_PLACEHOLDER);

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits from the send button through the shared composer path", () => {
    const onSubmit = vi.fn();

    render(
      <Composer
        busy={false}
        value="hello"
        onValueChange={() => {}}
        onSubmit={onSubmit}
        onAbort={() => undefined}
        models={[]}
        currentModel={null}
        thinkingLevel="medium"
        availableThinkingLevels={["off", "medium", "high"]}
        attachments={[]}
        slashCommands={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

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
        slashCommands={[]}
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
        slashCommands={[]}
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
        slashCommands={[]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText(DEFAULT_PLACEHOLDER);
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
        slashCommands={[]}
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

  it("shows slash command autocomplete and applies the selected command", () => {
    const onValueChange = vi.fn();

    render(
      <Composer
        busy={false}
        value="/"
        onValueChange={onValueChange}
        onSubmit={() => {}}
        onAbort={() => undefined}
        models={[]}
        currentModel={null}
        thinkingLevel="medium"
        availableThinkingLevels={["off", "medium", "high"]}
        attachments={[]}
        slashCommands={[
          { command: "/tree", description: "Navigate the session tree", source: "builtin" },
          { command: "/model", description: "Open the model picker", source: "builtin" },
        ]}
        onSetModel={() => {}}
        onSetThinkingLevel={() => {}}
        onPickAttachments={() => {}}
        onRemoveAttachment={() => {}}
        onClearAttachments={() => {}}
      />,
    );

    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\/tree/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\/model/i })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Slash commands" }).className).toContain("bottom-[calc(100%+0.5rem)]");
    expect(screen.getByRole("listbox", { name: "Slash commands" }).className).toContain("bg-popover");

    fireEvent.keyDown(screen.getByPlaceholderText(DEFAULT_PLACEHOLDER), { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("/tree");
  });
});
