import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { StudioHost } from "../../pi-host/studio-host";
import { IPC_CHANNELS } from "../../shared/ipc";
import { BrowserRuntime } from "./browser-runtime";
import { resolvePreloadScriptPath } from "./preload-path";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

if (process.platform === "linux" && (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)) {
  app.disableHardwareAcceleration();
}

app.commandLine.appendSwitch("remote-debugging-port", "9222");

let mainWindow: BrowserWindow | null = null;
let host: StudioHost | null = null;
let browserRuntime: BrowserRuntime | null = null;

function sendSnapshot(snapshot: unknown) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.push.snapshot, snapshot);
}

function sendTuiData(chunk: { sessionId: string; data: string }) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.push.tuiData, chunk);
}

function sendTerminalData(chunk: { sessionId: string; data: string }) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.push.terminalData, chunk);
}

function readLaunchProjectPath() {
  const launchPath = process.env.PI_STUDIO_LAUNCH_CWD;
  if (!launchPath || launchPath.trim().length === 0) {
    return null;
  }

  return launchPath;
}

type BrowserCdpTarget = {
  id: string;
  webSocketDebuggerUrl: string;
  url: string;
  title: string;
};

async function resolveBrowserCdpTarget(payload?: { url?: string; title?: string }): Promise<BrowserCdpTarget | null> {
  try {
    const response = await fetch("http://127.0.0.1:9222/json/list", {
      cache: "no-store",
    });

    if (!response.ok) return null;

    const targets = (await response.json()) as Array<{
      id?: string;
      type?: string;
      title?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
    }>;

    const pages = targets.filter(
      (target) =>
        target.type === "page" &&
        typeof target.webSocketDebuggerUrl === "string" &&
        target.webSocketDebuggerUrl.length > 0,
    );

    const byUrl = payload?.url
      ? pages.find((target) => target.url === payload.url || target.url?.startsWith(payload.url ?? ""))
      : null;

    const byTitle = payload?.title
      ? pages.find((target) => target.title === payload.title)
      : null;

    const target = byUrl ?? byTitle ?? pages[0];
    if (!target || !target.webSocketDebuggerUrl) return null;

    return {
      id: String(target.id ?? ""),
      webSocketDebuggerUrl: String(target.webSocketDebuggerUrl),
      url: String(target.url ?? ""),
      title: String(target.title ?? ""),
    };
  } catch {
    return null;
  }
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    backgroundColor: "#0c0c0e",
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreloadScriptPath(currentDirPath),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.join(currentDirPath, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function initializeHost() {
  host = new StudioHost({
    storePath: path.join(app.getPath("userData"), "workspace.json"),
    launchProjectPath: readLaunchProjectPath(),
    onSnapshot: sendSnapshot,
    onTuiData: sendTuiData,
    onTerminalData: sendTerminalData,
  });

  await host.initialize();
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.invoke.bootstrap, async () => host?.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.invoke.addProject, async () => host?.promptForProject());
  ipcMain.handle(IPC_CHANNELS.invoke.selectProject, async (_event, projectId: string) =>
    host?.selectProject(projectId),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.reorderProjects, async (_event, projectIds: string[]) =>
    host?.reorderProjects(projectIds),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.renameProject,
    async (_event, payload: { projectId: string; name: string }) =>
      host?.renameProject(payload.projectId, payload.name),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.removeProject, async (_event, projectId: string) =>
    host?.removeProject(projectId),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.toggleProjectFavorite, async (_event, projectId: string) =>
    host?.toggleProjectFavorite(projectId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.createThread,
    async (_event, payload: string | { projectId: string; sessionId?: string }) => {
      const projectId = typeof payload === "string" ? payload : payload.projectId;
      const sessionId = typeof payload === "string" ? undefined : payload.sessionId;
      return host?.createThread(projectId, sessionId);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.openThread,
    async (_event, payload: { projectId: string; sessionFile: string; sessionId?: string }) =>
      host?.openThread(payload.projectId, payload.sessionFile, payload.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.closeSession,
    async (_event, payload: { sessionId: string }) => host?.closeSession(payload.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.deleteThread,
    async (_event, payload: { projectId: string; sessionFile: string }) =>
      host?.deleteThread(payload.projectId, payload.sessionFile),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.toggleThreadPinned,
    async (_event, payload: { projectId: string; sessionFile: string }) =>
      host?.toggleThreadPinned(payload.projectId, payload.sessionFile),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.toggleThreadArchived,
    async (_event, payload: { projectId: string; sessionFile: string }) =>
      host?.toggleThreadArchived(payload.projectId, payload.sessionFile),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.sendPrompt,
    async (_event, payload: { text: string; sessionId?: string }) =>
      host?.sendPrompt(payload.text, payload.sessionId),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.abortPrompt, async (_event, payload?: { sessionId?: string }) =>
    host?.abortPrompt(payload?.sessionId),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.pickAttachments, async (_event, payload?: { sessionId?: string }) =>
    host?.pickAttachments(payload?.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.removeAttachment,
    async (_event, payload: string | { attachmentId: string; sessionId?: string }) => {
      const attachmentId = typeof payload === "string" ? payload : payload.attachmentId;
      const sessionId = typeof payload === "string" ? undefined : payload.sessionId;
      return host?.removeAttachment(attachmentId, sessionId);
    },
  );
  ipcMain.handle(IPC_CHANNELS.invoke.clearAttachments, async (_event, payload?: { sessionId?: string }) =>
    host?.clearAttachments(payload?.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.setModel,
    async (_event, payload: { provider: string; modelId: string; sessionId?: string }) =>
      host?.setModel(payload.provider, payload.modelId, payload.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.setThinkingLevel,
    async (_event, payload: string | { level: string; sessionId?: string }) => {
      const normalized =
        typeof payload === "string"
          ? { level: payload, sessionId: undefined }
          : { level: payload?.level ?? "", sessionId: payload?.sessionId };

      return host?.setThinkingLevel(normalized.level, normalized.sessionId);
    },
  );
  ipcMain.handle(IPC_CHANNELS.invoke.setStreamingBehavior, async (_event, mode: "steer" | "followUp") =>
    host?.setStreamingBehavior(mode),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.setMode, async (_event, mode) => host?.setMode(mode));
  ipcMain.handle(IPC_CHANNELS.invoke.startTui, async (_event, payload?: { sessionId?: string }) =>
    host?.startTui(payload?.sessionId ?? "default"),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.stopTui, async (_event, payload?: { sessionId?: string }) =>
    host?.stopTui(payload?.sessionId ?? "default"),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.startTerminal, async (_event, payload?: { sessionId?: string }) =>
    host?.startTerminal(payload?.sessionId ?? "default"),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.stopTerminal, async (_event, payload?: { sessionId?: string }) =>
    host?.stopTerminal(payload?.sessionId ?? "default"),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.refreshGitState, async () => host?.refreshGitState());
  ipcMain.handle(IPC_CHANNELS.invoke.setGitBaseline, async (_event, baseline) => host?.setGitBaseline(baseline));
  ipcMain.handle(
    IPC_CHANNELS.invoke.addGitComment,
    async (_event, payload: { filePath: string; text: string }) =>
      host?.addGitComment(payload.filePath, payload.text),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.removeGitComment, async (_event, commentId: string) =>
    host?.removeGitComment(commentId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.getProjectFileTree,
    async (_event, payload?: { projectId?: string }) => host?.getProjectFileTree(payload?.projectId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.searchSessions,
    async (_event, payload?: { query?: string }) => host?.searchSessions(payload?.query ?? ""),
  );
  ipcMain.handle(IPC_CHANNELS.invoke.getSessionTree, async (_event, payload?: { sessionId?: string }) =>
    host?.getSessionTree(payload?.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.navigateTree,
    async (
      _event,
      payload: {
        sessionId?: string;
        targetId: string;
        options?: {
          summarize?: boolean;
          customInstructions?: string;
          replaceInstructions?: boolean;
          label?: string;
        };
      },
    ) => host?.navigateTree(payload.targetId, payload.options, payload.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.runSlashCommand,
    async (_event, payload: { text: string; sessionId?: string }) =>
      host?.runSlashCommand(payload.text, payload.sessionId),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.getBrowserCdpTarget,
    async (_event, payload?: { url?: string; title?: string }) => resolveBrowserCdpTarget(payload),
  );
  ipcMain.handle(
    IPC_CHANNELS.invoke.bindBrowserSurface,
    async (_event, payload: { sessionFile: string; webContentsId: number; url?: string; title?: string }) => {
      browserRuntime?.bindSurface(payload.sessionFile, payload.webContentsId, {
        url: payload.url,
        title: payload.title,
      });
    },
  );
  ipcMain.handle(IPC_CHANNELS.invoke.clearBrowserSurfaceBinding, async (_event, sessionFile: string) => {
    browserRuntime?.clearSurfaceBinding(sessionFile);
  });
  ipcMain.on(
    IPC_CHANNELS.invoke.resizeTui,
    (_event, payload: { cols: number; rows: number; sessionId?: string }) =>
      host?.resizeTui(payload.cols, payload.rows, payload.sessionId ?? "default"),
  );
  ipcMain.on(IPC_CHANNELS.invoke.tuiInput, (_event, payload: { data: string; sessionId?: string }) =>
    host?.writeToTui(payload.data, payload.sessionId ?? "default"),
  );
  ipcMain.on(
    IPC_CHANNELS.invoke.resizeTerminal,
    (_event, payload: { cols: number; rows: number; sessionId?: string }) =>
      host?.resizeTerminal(payload.cols, payload.rows, payload.sessionId ?? "default"),
  );
  ipcMain.on(IPC_CHANNELS.invoke.terminalInput, (_event, payload: { data: string; sessionId?: string }) =>
    host?.writeToTerminal(payload.data, payload.sessionId ?? "default"),
  );
}

app
  .whenReady()
  .then(async () => {
    if (process.platform !== "darwin") {
      Menu.setApplicationMenu(null);
    }

    browserRuntime = new BrowserRuntime();
    await browserRuntime.whenReady();
    registerIpcHandlers();
    await initializeHost();
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error("Failed to start Pi Studio", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  host?.dispose();
  browserRuntime?.dispose();
});
