const BROWSER_RUNTIME_KEY = "__PI_STUDIO_BROWSER_RUNTIME__";

function getBrowserRuntime() {
  const runtime = globalThis[BROWSER_RUNTIME_KEY];
  if (!runtime || typeof runtime !== "object") {
    throw new Error("Pi Studio browser runtime is unavailable.");
  }

  return runtime;
}

function wrapTab(sessionFile) {
  const runtime = getBrowserRuntime();
  const request = (action, extra = {}) => runtime.performAction({ action, sessionFile, ...extra });

  return {
    async goto(url) {
      return request("navigate", { url });
    },
    async reload() {
      return request("reload");
    },
    async back() {
      return request("back");
    },
    async forward() {
      return request("forward");
    },
    async url() {
      const state = await request("state");
      return state.url;
    },
    async title() {
      const state = await request("state");
      return state.title;
    },
    async snapshot(limit) {
      return request("snapshot", { limit });
    },
    async click(selector) {
      return request("click", { selector });
    },
    async fill(selector, text) {
      return request("fill", { selector, text });
    },
    async type(selector, text) {
      return request("type", { selector, text });
    },
    async press(key, selector) {
      return request("press", { key, selector });
    },
    async wait(options = {}) {
      return request("wait", {
        selector: options.selector,
        url: options.url,
        waitFor: options.waitFor,
        timeoutMs: options.timeoutMs,
      });
    },
    async extract(selector, options = {}) {
      return request("extract", {
        selector,
        extractMode: options.extractMode,
        attribute: options.attribute,
      });
    },
    async screenshot() {
      return request("screenshot");
    },
    async logs(limit) {
      return request("logs", { limit });
    },
    clipboard: {
      readText: async () => {
        const result = await request("clipboard_read");
        return result.text ?? "";
      },
      writeText: async (text) => {
        await request("clipboard_write", { text });
      },
    },
  };
}

export async function setupAtlasRuntime({ globals, backend }) {
  if (backend !== "iab") {
    throw new Error(`Unsupported browser backend: ${backend}`);
  }

  const runtime = getBrowserRuntime();

  globals.agent = {
    browser: {
      async nameSession(name) {
        runtime.setSessionName(String(name || "").trim());
      },
      tabs: {
        async selected() {
          const sessionFile = runtime.getLatestBoundSessionFile();
          if (!sessionFile) {
            return undefined;
          }

          return wrapTab(sessionFile);
        },
        async new() {
          const sessionFile = runtime.getLatestBoundSessionFile();
          if (!sessionFile) {
            throw new Error("No live browser binding is available yet.");
          }

          return wrapTab(sessionFile);
        },
        async list() {
          return runtime.listBindings();
        },
        async get(sessionFile) {
          return wrapTab(sessionFile);
        },
      },
    },
  };

  globals.display = async (value) => value;
}
