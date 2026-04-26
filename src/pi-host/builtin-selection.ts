import type { ThreadSummary } from "../shared/types";
import type { ThreadMetadata } from "./workspace-bootstrap";

type OpenSessionOptions =
  | { kind: "continue" }
  | { kind: "new" }
  | { kind: "open"; sessionFile: string };

type BuiltinSelectionInput = {
  options: OpenSessionOptions;
  threadsForProject: ThreadSummary[];
  metadataBySessionFile: Record<string, ThreadMetadata>;
};

export function shouldUsePiStudioBuiltins({
  options,
  threadsForProject,
  metadataBySessionFile,
}: BuiltinSelectionInput) {
  if (options.kind === "new") return false;

  if (options.kind === "open") {
    return Boolean(metadataBySessionFile[options.sessionFile]?.piStudioBuiltins);
  }

  const mostRecentThread = threadsForProject.reduce<ThreadSummary | null>((latest, thread) => {
    if (!latest) return thread;
    return thread.updatedAtMs > latest.updatedAtMs ? thread : latest;
  }, null);

  if (!mostRecentThread?.sessionFile) return false;
  return Boolean(metadataBySessionFile[mostRecentThread.sessionFile]?.piStudioBuiltins);
}
