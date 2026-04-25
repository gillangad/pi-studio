export function createNoopExtensionBindings(options: {
  getEditorText: () => string;
  onStatus: (message: string) => void;
  onCreateSession: () => Promise<void>;
  onSwitchSession: (sessionPath: string) => Promise<boolean>;
}) {
  const uiContext = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: (message: string) => options.onStatus(message),
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text?: string) => {
      if (text) options.onStatus(text);
    },
    setWorkingMessage: (message?: string) => {
      if (message) options.onStatus(message);
    },
    setHiddenThinkingLabel: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async () => undefined,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: options.getEditorText,
    editor: async () => undefined,
    setEditorComponent: () => {},
    get theme() {
      return {};
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Theme switching is not implemented in Pi Studio GUI mode." }),
    getToolsExpanded: () => true,
    setToolsExpanded: () => {},
  };

  return {
    uiContext,
    commandContextActions: {
      waitForIdle: async (session: any) => {
        await session.agent.waitForIdle();
      },
      newSession: async () => {
        await options.onCreateSession();
        return { cancelled: false };
      },
      fork: async () => ({ cancelled: true }),
      navigateTree: async () => ({ cancelled: true }),
      switchSession: async (sessionPath: string) => {
        const success = await options.onSwitchSession(sessionPath);
        return { cancelled: !success };
      },
      reload: async () => {},
    },
    shutdownHandler: () => {},
    onError: (error: unknown) => {
      options.onStatus(`Extension error: ${error instanceof Error ? error.message : String(error)}`);
    },
  };
}
