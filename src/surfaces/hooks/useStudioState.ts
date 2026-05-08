import { useEffect, useMemo, useState } from "react";
import type { DesktopBridge } from "../../shared/ipc";
import type { GitDiffBaseline, StreamingBehaviorPreference, StudioMode, StudioSnapshot } from "../../shared/types";

const BRIDGE_MISSING_ERROR =
  "Pi Studio desktop bridge is unavailable. Restart the app and check preload configuration.";

function readBridge(): DesktopBridge | null {
  return (window as Window & { piStudio?: DesktopBridge }).piStudio ?? null;
}

export function useStudioState() {
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const bridge = readBridge();

  useEffect(() => {
    if (!bridge) {
      setBootstrapError(BRIDGE_MISSING_ERROR);
      return;
    }

    let disposed = false;

    bridge
      .bootstrap()
      .then((next) => {
        if (!disposed) {
          setSnapshot(next);
          setBootstrapError(null);
        }
      })
      .catch((error) => {
        if (!disposed) {
          setBootstrapError(error instanceof Error ? error.message : String(error));
        }
      });

    const unsubscribe = bridge.onSnapshot((next) => {
      setSnapshot(next);
      setBootstrapError(null);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [bridge]);

  const actions = useMemo(() => {
    if (!bridge) {
      const unavailable = async (..._args: unknown[]) => {
        throw new Error(BRIDGE_MISSING_ERROR);
      };

      return {
        addProject: unavailable,
        selectProject: unavailable,
        reorderProjects: unavailable,
        renameProject: unavailable,
        removeProject: unavailable,
        toggleProjectFavorite: unavailable,
        createThread: unavailable,
        openThread: unavailable,
        closeSession: unavailable,
        deleteThread: unavailable,
        toggleThreadPinned: unavailable,
        toggleThreadArchived: unavailable,
        sendPrompt: unavailable,
        abortPrompt: unavailable,
        pickAttachments: unavailable,
        removeAttachment: unavailable,
        clearAttachments: unavailable,
        setModel: unavailable,
        setThinkingLevel: unavailable,
        setStreamingBehavior: unavailable,
        setMode: unavailable,
        chooseMasterSessionDirectory: unavailable,
        setMasterSessionDirectoryToHome: unavailable,
        startTui: unavailable,
        stopTui: unavailable,
        startTerminal: unavailable,
        stopTerminal: unavailable,
        refreshGitState: unavailable,
        setGitBaseline: unavailable,
        addGitComment: unavailable,
        removeGitComment: unavailable,
        getProjectFileTree: unavailable,
        searchSessions: unavailable,
        getSessionTree: unavailable,
        navigateTree: unavailable,
        runSlashCommand: unavailable,
        resizeTui: (..._args: unknown[]) => {},
        writeToTui: (..._args: unknown[]) => {},
        resizeTerminal: (..._args: unknown[]) => {},
        writeToTerminal: (..._args: unknown[]) => {},
        onTuiData: () => () => {},
        onTerminalData: () => () => {},
      };
    }

    return {
      addProject: () => bridge.addProject(),
      selectProject: (projectId: string) => bridge.selectProject(projectId),
      reorderProjects: (projectIds: string[]) => bridge.reorderProjects(projectIds),
      renameProject: (projectId: string, name: string) => bridge.renameProject(projectId, name),
      removeProject: (projectId: string) => bridge.removeProject(projectId),
      toggleProjectFavorite: (projectId: string) => bridge.toggleProjectFavorite(projectId),
      createThread: (projectId: string, sessionId?: string) => bridge.createThread(projectId, sessionId),
      openThread: (projectId: string, sessionFile: string, sessionId?: string) =>
        bridge.openThread(projectId, sessionFile, sessionId),
      closeSession: (sessionId: string) => bridge.closeSession(sessionId),
      deleteThread: (projectId: string, sessionFile: string) =>
        bridge.deleteThread({ projectId, sessionFile }),
      toggleThreadPinned: (projectId: string, sessionFile: string) =>
        bridge.toggleThreadPinned({ projectId, sessionFile }),
      toggleThreadArchived: (projectId: string, sessionFile: string) =>
        bridge.toggleThreadArchived({ projectId, sessionFile }),
      sendPrompt: (text: string, sessionId?: string) =>
        bridge.sendPrompt({ text, ...(sessionId ? { sessionId } : {}) }),
      abortPrompt: (sessionId?: string) => bridge.abortPrompt(sessionId ? { sessionId } : undefined),
      pickAttachments: (sessionId?: string) => bridge.pickAttachments(sessionId ? { sessionId } : undefined),
      removeAttachment: (attachmentId: string, sessionId?: string) => bridge.removeAttachment(attachmentId, sessionId),
      clearAttachments: (sessionId?: string) => bridge.clearAttachments(sessionId ? { sessionId } : undefined),
      setModel: (provider: string, modelId: string, sessionId?: string) =>
        bridge.setModel({ provider, modelId, ...(sessionId ? { sessionId } : {}) }),
      setThinkingLevel: (level: string, sessionId?: string) => bridge.setThinkingLevel(level, sessionId),
      setStreamingBehavior: (mode: StreamingBehaviorPreference) => bridge.setStreamingBehavior(mode),
      setMode: (mode: StudioMode) => bridge.setMode(mode),
      chooseMasterSessionDirectory: () => bridge.chooseMasterSessionDirectory(),
      setMasterSessionDirectoryToHome: () => bridge.setMasterSessionDirectoryToHome(),
      startTui: (sessionId?: string) => bridge.startTui(sessionId ? { sessionId } : undefined),
      stopTui: (sessionId?: string) => bridge.stopTui(sessionId ? { sessionId } : undefined),
      startTerminal: (sessionId?: string) => bridge.startTerminal(sessionId ? { sessionId } : undefined),
      stopTerminal: (sessionId?: string) => bridge.stopTerminal(sessionId ? { sessionId } : undefined),
      resizeTui: (cols: number, rows: number, sessionId?: string) =>
        bridge.resizeTui({ cols, rows, ...(sessionId ? { sessionId } : {}) }),
      writeToTui: (data: string, sessionId?: string) =>
        bridge.tuiInput({ data, ...(sessionId ? { sessionId } : {}) }),
      resizeTerminal: (cols: number, rows: number, sessionId?: string) =>
        bridge.resizeTerminal({ cols, rows, ...(sessionId ? { sessionId } : {}) }),
      writeToTerminal: (data: string, sessionId?: string) =>
        bridge.terminalInput({ data, ...(sessionId ? { sessionId } : {}) }),
      refreshGitState: () => bridge.refreshGitState(),
      setGitBaseline: (baseline: GitDiffBaseline) => bridge.setGitBaseline(baseline),
      addGitComment: (filePath: string, text: string) => bridge.addGitComment({ filePath, text }),
      removeGitComment: (commentId: string) => bridge.removeGitComment(commentId),
      getProjectFileTree: (projectId?: string) => bridge.getProjectFileTree(projectId ? { projectId } : undefined),
      searchSessions: (query: string) => bridge.searchSessions({ query }),
      getSessionTree: (sessionId?: string) => bridge.getSessionTree(sessionId ? { sessionId } : undefined),
      navigateTree: (
        targetId: string,
        options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
        sessionId?: string,
      ) => bridge.navigateTree({ targetId, options, ...(sessionId ? { sessionId } : {}) }),
      runSlashCommand: (text: string, sessionId?: string) =>
        bridge.runSlashCommand({ text, ...(sessionId ? { sessionId } : {}) }),
      onTuiData: bridge.onTuiData,
      onTerminalData: bridge.onTerminalData,
    };
  }, [bridge]);

  return {
    snapshot,
    bootstrapError,
    actions,
  };
}
