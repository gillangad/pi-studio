import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type DesktopBridge } from "../../shared/ipc";

function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

const bridge: DesktopBridge = {
  bootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.bootstrap),
  addProject: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.addProject),
  selectProject: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.selectProject, projectId),
  reorderProjects: (projectIds) => ipcRenderer.invoke(IPC_CHANNELS.invoke.reorderProjects, projectIds),
  renameProject: (projectId, name) => ipcRenderer.invoke(IPC_CHANNELS.invoke.renameProject, { projectId, name }),
  removeProject: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.removeProject, projectId),
  toggleProjectFavorite: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.toggleProjectFavorite, projectId),
  createThread: (projectId, sessionId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.invoke.createThread,
      sessionId ? { projectId, sessionId } : projectId,
    ),
  openThread: (projectId, sessionFile, sessionId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.invoke.openThread,
      sessionId ? { projectId, sessionFile, sessionId } : { projectId, sessionFile },
    ),
  deleteThread: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.deleteThread, payload),
  toggleThreadPinned: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.toggleThreadPinned, payload),
  toggleThreadArchived: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.toggleThreadArchived, payload),
  sendPrompt: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.sendPrompt, payload),
  abortPrompt: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.abortPrompt, payload),
  pickAttachments: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.pickAttachments, payload),
  removeAttachment: (attachmentId, sessionId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.invoke.removeAttachment,
      sessionId ? { attachmentId, sessionId } : attachmentId,
    ),
  clearAttachments: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.clearAttachments, payload),
  setModel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.setModel, payload),
  setThinkingLevel: (level, sessionId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.invoke.setThinkingLevel,
      sessionId ? { level, sessionId } : level,
    ),
  setStreamingBehavior: (mode) => ipcRenderer.invoke(IPC_CHANNELS.invoke.setStreamingBehavior, mode),
  setMode: (mode) => ipcRenderer.invoke(IPC_CHANNELS.invoke.setMode, mode),
  startTui: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.startTui, payload),
  stopTui: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.stopTui, payload),
  resizeTui: (size) => ipcRenderer.send(IPC_CHANNELS.invoke.resizeTui, size),
  tuiInput: (chunk) => ipcRenderer.send(IPC_CHANNELS.invoke.tuiInput, chunk),
  startTerminal: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.startTerminal, payload),
  stopTerminal: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.stopTerminal, payload),
  resizeTerminal: (size) => ipcRenderer.send(IPC_CHANNELS.invoke.resizeTerminal, size),
  terminalInput: (chunk) => ipcRenderer.send(IPC_CHANNELS.invoke.terminalInput, chunk),
  refreshGitState: () => ipcRenderer.invoke(IPC_CHANNELS.invoke.refreshGitState),
  setGitBaseline: (baseline) => ipcRenderer.invoke(IPC_CHANNELS.invoke.setGitBaseline, baseline),
  addGitComment: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.addGitComment, payload),
  removeGitComment: (commentId) => ipcRenderer.invoke(IPC_CHANNELS.invoke.removeGitComment, commentId),
  getProjectFileTree: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.getProjectFileTree, payload),
  searchSessions: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.searchSessions, payload),
  getSessionTree: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.getSessionTree, payload),
  navigateTree: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.navigateTree, payload),
  runSlashCommand: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.runSlashCommand, payload),
  getBrowserCdpTarget: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.getBrowserCdpTarget, payload),
  bindBrowserSurface: (payload) => ipcRenderer.invoke(IPC_CHANNELS.invoke.bindBrowserSurface, payload),
  clearBrowserSurfaceBinding: (sessionFile) =>
    ipcRenderer.invoke(IPC_CHANNELS.invoke.clearBrowserSurfaceBinding, sessionFile),
  onSnapshot: (callback) => subscribe(IPC_CHANNELS.push.snapshot, callback),
  onTuiData: (callback) => subscribe(IPC_CHANNELS.push.tuiData, callback),
  onTerminalData: (callback) => subscribe(IPC_CHANNELS.push.terminalData, callback),
};

contextBridge.exposeInMainWorld("piStudio", bridge);
