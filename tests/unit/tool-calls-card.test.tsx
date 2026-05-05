import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCallsCard } from "../../src/surfaces/components/ToolCallsCard";

describe("ToolCallsCard", () => {
  it("shows a collapsed group summary before expanding tool calls", () => {
    render(
      <ToolCallsCard
        messages={[
          {
            id: "tool-read",
            role: "toolResult",
            toolName: "read",
            content: ["read src/surfaces/app/styles.css:500-559\n\nline 1\nline 2"],
          },
          {
            id: "tool-edit",
            role: "toolResult",
            toolName: "edit",
            content: ["edit src/surfaces/components/ToolCallsCard.tsx\n\n- old\n+ new"],
          },
          {
            id: "tool-write",
            role: "toolResult",
            toolName: "write",
            content: ["write tests/unit/tool-calls-card.test.tsx\n\nimport x"],
          },
          {
            id: "tool-bash",
            role: "toolResult",
            toolName: "bash",
            content: ["$ npm run typecheck (timeout 240s)\n\nall good"],
          },
        ]}
      />,
    );

    expect(screen.queryByText("src/surfaces/app/styles.css:500-559")).not.toBeInTheDocument();
    expect(screen.getByText("Edited 2 files, ran 1 command")).toBeInTheDocument();
    expect(screen.queryByText(/^Edited src\/surfaces\/components\/ToolCallsCard\.tsx$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("button", { name: /Read\s+src\/surfaces\/app\/styles\.css:500-559/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edited\s+src\/surfaces\/components\/ToolCallsCard\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edited\s+tests\/unit\/tool-calls-card\.test\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ran\s+npm run typecheck \(timeout 240s\)/ })).toBeInTheDocument();
    expect(screen.getByText("src/surfaces/app/styles.css:500-559")).toBeInTheDocument();
  });

  it("keeps single tool call collapsed by default without extra group label", () => {
    render(
      <ToolCallsCard
        messages={[
          {
            id: "tool-1",
            role: "toolResult",
            content: ["read src/file.ts:1-5\n\nconst a = 1;"],
            toolName: "read",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /Read\s+src\/file\.ts:1-5/ })).toBeInTheDocument();
    expect(screen.queryByText("Tool calls (1)")).not.toBeInTheDocument();
    expect(screen.queryByText("const a = 1;")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Read\s+src\/file\.ts:1-5/ }));

    expect(screen.getByText("const a = 1;")).toBeInTheDocument();
  });

  it("shows created files inside an expandable diff-style block", () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");

    render(
      <ToolCallsCard
        messages={[
          {
            id: "tool-write",
            role: "toolResult",
            content: [`write src/file.ts\n\n${lines}`],
            toolName: "write",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /Edited\s+src\/file\.ts/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Edited\s+src\/file\.ts/ }));

    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(screen.getByText("line 30")).toBeInTheDocument();
  });

  it("shows failed bash tool calls with a red pill and output", () => {
    render(
      <ToolCallsCard
        messages={[
          {
            id: "bash-1",
            role: "toolResult",
            toolName: "bash",
            content: ["$ npm run typecheck\n\nsrc/file.ts:1:1 error\nCommand exited with code 2"],
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /Ran\s+npm run typecheck/ })).toBeInTheDocument();
    expect(screen.queryByText("src/file.ts:1:1 error")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ran\s+npm run typecheck/ }));

    expect(screen.getByText("src/file.ts:1:1 error")).toBeInTheDocument();
  });

  it("keeps failed items collapsed inside a collapsed group until opened", () => {
    render(
      <ToolCallsCard
        messages={[
          {
            id: "bash-ok",
            role: "toolResult",
            toolName: "bash",
            content: ["$ npm run build\n\nok\nCommand exited with code 0"],
          },
          {
            id: "bash-bad",
            role: "toolResult",
            toolName: "bash",
            content: ["$ npm run typecheck\n\nsrc/file.ts:1:1 error\nCommand exited with code 2"],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("Ran 2 commands")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ran\s+npm run typecheck/ })).toBeInTheDocument();
    expect(screen.queryByText("src/file.ts:1:1 error")).not.toBeInTheDocument();
    expect(screen.queryByText(/^ok$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ran\s+npm run typecheck/ }));

    expect(screen.getByText("src/file.ts:1:1 error")).toBeInTheDocument();
  });
});
