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
  void options;
  void threadsForProject;
  void metadataBySessionFile;
  return true;
}

const PI_STUDIO_ACTIVE_TOOL_NAMES = ["read", "bash", "edit", "write", "browser", "control", "artifact"] as const;

export function getPiStudioInitialActiveToolNames(usePiStudioBuiltins: boolean) {
  return usePiStudioBuiltins ? [...PI_STUDIO_ACTIVE_TOOL_NAMES] : undefined;
}
