import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import type { TuiState } from "../../shared/types";
import { Button } from "./ui/button";

type TuiViewProps = {
  sessionId?: string;
  stopOnUnmount?: boolean;
  tui: TuiState;
  onStart: (sessionId?: string) => Promise<unknown> | unknown;
  onStop: (sessionId?: string) => Promise<unknown> | unknown;
  onResize: (cols: number, rows: number, sessionId?: string) => void;
  onData: (data: string, sessionId?: string) => void;
  subscribeToData: (callback: (payload: { data: string; sessionId?: string }) => void) => () => void;
};

type ScheduledHandle = number | ReturnType<typeof globalThis.setTimeout>;

function terminalThemeFromCss(): ITheme {
  const styles = getComputedStyle(document.documentElement);
  const readToken = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

  const background = readToken("--terminal-bg", "#11141e");
  const foreground = readToken("--terminal-fg", "#d5daed");
  const accent = readToken("--terminal-accent", "#8ea2ff");
  const muted = readToken("--terminal-muted", "#99a1c2");

  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    selectionBackground: "rgba(142, 162, 255, 0.22)",
    selectionInactiveBackground: "rgba(142, 162, 255, 0.12)",
    black: background,
    red: "#f18f9a",
    green: "#83deaa",
    yellow: "#f4d38c",
    blue: accent,
    magenta: "#c8a2ff",
    cyan: muted,
    white: foreground,
    brightBlack: "#7c83a3",
    brightRed: "#ffadb5",
    brightGreen: "#9ff1bf",
    brightYellow: "#ffe2a4",
    brightBlue: "#b8c4ff",
    brightMagenta: "#dac1ff",
    brightCyan: "#b6bfdc",
    brightWhite: "#f7f9ff",
  };
}

function scheduleFrame(callback: () => void): ScheduledHandle {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return globalThis.setTimeout(callback, 16);
}

function cancelScheduledFrame(handle: ScheduledHandle | null) {
  if (handle === null) return;

  if (typeof handle === "number" && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(handle);
    return;
  }

  clearTimeout(handle);
}

function wheelDeltaInPixels(event: WheelEvent) {
  const lineHeightPx = 16;
  const pageHeightPx = typeof window !== "undefined" ? (window.innerHeight || 800) : 800;

  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return event.deltaY * lineHeightPx;
    case WheelEvent.DOM_DELTA_PAGE:
      return event.deltaY * pageHeightPx;
    default:
      return event.deltaY;
  }
}

export function TuiView({
  sessionId = "default",
  stopOnUnmount = true,
  tui,
  onStart,
  onStop,
  onResize,
  onData,
  subscribeToData,
}: TuiViewProps) {
  const viewportShellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitFrameRef = useRef<ScheduledHandle | null>(null);
  const scrollSyncFrameRef = useRef<ScheduledHandle | null>(null);
  const startupTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollToBottom = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    terminal.scrollToBottom();
    terminal.focus();
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    const mount = containerRef.current;
    const viewportShell = viewportShellRef.current;
    if (!mount || !viewportShell) return;

    const terminal = new Terminal({
      cursorBlink: true,
      lineHeight: 1.2,
      fontSize: 12,
      scrollback: 5_000,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0,
      theme: terminalThemeFromCss(),
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(mount);
    terminalRef.current = terminal;

    const syncScrollButtonVisibility = () => {
      const viewport = mount.querySelector(".xterm-viewport") as HTMLElement | null;
      if (!viewport) {
        setShowScrollToBottom(false);
        return;
      }

      const distanceFromBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      setShowScrollToBottom(distanceFromBottom > 12);
    };

    const scheduleScrollSync = () => {
      cancelScheduledFrame(scrollSyncFrameRef.current);

      scrollSyncFrameRef.current = scheduleFrame(() => {
        scrollSyncFrameRef.current = null;
        syncScrollButtonVisibility();
      });
    };

    const fitAndResize = () => {
      fitAddon.fit();
      onResize(terminal.cols, terminal.rows, sessionId);
      scheduleScrollSync();
    };

    const scheduleFit = () => {
      cancelScheduledFrame(fitFrameRef.current);

      fitFrameRef.current = scheduleFrame(() => {
        fitFrameRef.current = null;
        fitAndResize();
      });
    };

    terminal.focus();
    scheduleFit();

    const viewport = mount.querySelector(".xterm-viewport") as HTMLElement | null;
    const handleViewportScroll = () => {
      syncScrollButtonVisibility();
    };
    const handleWheel = (event: WheelEvent) => {
      if (!viewport || event.defaultPrevented || event.deltaY === 0) {
        return;
      }

      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
      if (maxScrollTop <= 0) {
        return;
      }

      const nextScrollTop = Math.min(maxScrollTop, Math.max(0, viewport.scrollTop + wheelDeltaInPixels(event)));
      if (nextScrollTop === viewport.scrollTop) {
        return;
      }

      viewport.scrollTop = nextScrollTop;
      event.preventDefault();
      syncScrollButtonVisibility();
    };

    viewport?.addEventListener("scroll", handleViewportScroll);
    viewportShell.addEventListener("wheel", handleWheel, { passive: false });

    const inputDisposable = terminal.onData((data) => onData(data, sessionId));
    const unsubscribe = subscribeToData((payload) => {
      const targetSessionId = payload.sessionId ?? "default";
      if (targetSessionId !== sessionId) return;
      terminal.write(payload.data);
      scheduleScrollSync();
    });
    const safeUnsubscribe = typeof unsubscribe === "function" ? unsubscribe : () => {};

    const resizeObserver = new ResizeObserver(() => {
      scheduleFit();
    });
    resizeObserver.observe(viewportShell);

    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = terminalThemeFromCss();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    void Promise.resolve(onStart(sessionId)).then(() => {
      scheduleFit();
      startupTimerRef.current = globalThis.setTimeout(() => {
        startupTimerRef.current = null;
        scheduleFit();
      }, 24);
    });

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      viewport?.removeEventListener("scroll", handleViewportScroll);
      viewportShell.removeEventListener("wheel", handleWheel);

      cancelScheduledFrame(fitFrameRef.current);
      cancelScheduledFrame(scrollSyncFrameRef.current);

      if (startupTimerRef.current !== null) {
        clearTimeout(startupTimerRef.current);
      }

      safeUnsubscribe();
      inputDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      setShowScrollToBottom(false);
      if (stopOnUnmount) {
        void Promise.resolve(onStop(sessionId));
      }
    };
  }, [onData, onResize, onStart, onStop, sessionId, stopOnUnmount, subscribeToData]);

  const sessionState = tui.sessions?.[sessionId] ?? null;
  const errorText = sessionState?.errorText ?? tui.errorText;

  return (
    <section className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background" aria-label="Hosted terminal">
      <div ref={viewportShellRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div className="terminal-viewport h-full bg-background">
          <div ref={containerRef} className="tui-terminal h-full w-full" />
        </div>

        {showScrollToBottom ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute bottom-5 right-5 h-8 w-8 rounded-full shadow-glass"
            aria-label="Scroll to bottom"
            title="Scroll to bottom"
            onClick={scrollToBottom}
          >
            ↓
          </Button>
        ) : null}
      </div>

      {errorText ? (
        <div className="mx-3 mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </div>
      ) : null}
    </section>
  );
}
