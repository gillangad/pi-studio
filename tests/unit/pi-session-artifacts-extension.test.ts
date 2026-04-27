import { describe, expect, it } from "vitest";
import sessionArtifactsExtension, {
  PI_SESSION_ARTIFACTS_PROMPT,
} from "../../src/builtins/extensions/pi-session-artifacts/index";

type BeforeAgentStartHandler = (
  event: { systemPrompt: string },
) => Promise<{ systemPrompt: string }> | { systemPrompt: string };

describe("pi-session-artifacts extension", () => {
  it("appends artifact instructions to the agent system prompt", async () => {
    let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;

    sessionArtifactsExtension({
      on(event: string, handler: BeforeAgentStartHandler) {
        if (event === "before_agent_start") {
          beforeAgentStartHandler = handler;
        }
      },
    } as any);

    expect(beforeAgentStartHandler).not.toBeNull();

    if (!beforeAgentStartHandler) {
      throw new Error("before_agent_start handler was not registered");
    }

    const result = await beforeAgentStartHandler({ systemPrompt: "Base prompt." });
    expect(result.systemPrompt).toContain("Base prompt.");
    expect(result.systemPrompt).toContain("fenced code block");
    expect(result.systemPrompt).toContain("`pi-artifact`");
    expect(result.systemPrompt).toContain("react-tsx");
    expect(result.systemPrompt).toContain("same id");
    expect(result.systemPrompt).toContain(PI_SESSION_ARTIFACTS_PROMPT);
  });
});
