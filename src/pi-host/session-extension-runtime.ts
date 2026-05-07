export const PI_STUDIO_SESSION_RUNTIME_KEY = "__PI_STUDIO_SESSION_RUNTIME__";

export type SessionToolAction =
  | "list"
  | "create"
  | "send"
  | "status"
  | "close";

export type SessionToolRequest = {
  action: SessionToolAction;
  targetSessionId?: string;
  prompt?: string;
  title?: string;
};

export type SessionToolResponse = {
  ok: boolean;
  action: SessionToolAction;
  message: string;
  session?: {
    sessionId: string;
    title: string;
    status: "idle" | "running" | "error";
    sessionFile: string | null;
  } | null;
  sessions?: Array<{
    sessionId: string;
    title: string;
    status: "idle" | "running" | "error";
    sessionFile: string | null;
  }>;
};

export type SessionRuntime = {
  isControllerSession(sessionFile?: string): boolean;
  performAction(request: SessionToolRequest): Promise<SessionToolResponse>;
};

export function registerPiStudioSessionRuntime(runtime: SessionRuntime | null) {
  const globals = globalThis as Record<string, unknown>;
  if (!runtime) {
    delete globals[PI_STUDIO_SESSION_RUNTIME_KEY];
    return;
  }

  globals[PI_STUDIO_SESSION_RUNTIME_KEY] = runtime;
}
