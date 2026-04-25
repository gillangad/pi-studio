import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../../src/shared/ipc";

describe("IPC channel contract", () => {
  it("keeps the expected invoke channels for shell to renderer coordination", () => {
    expect(IPC_CHANNELS.invoke.bootstrap).toBe("pi-studio:bootstrap");
    expect(IPC_CHANNELS.invoke.startTui).toBe("pi-studio:start-tui");
    expect(IPC_CHANNELS.invoke.searchSessions).toBe("pi-studio:search-sessions");
    expect(IPC_CHANNELS.push.snapshot).toBe("pi-studio:snapshot");
  });
});
