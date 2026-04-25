import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import type { TerminalState } from "../../shared/types";
import { Button } from "./ui/button";

type TerminalPanelProps = {
  sessionId?: string;
  terminal: TerminalState;
  onStart: (sessionId?: string) => Promise<unknown> | unknown;
  onStop: (sessionId?: string) => Promise<unknown> | unknown;
  onResize: (cols: number, rows: number, sessionId?: string) => void;
  onData: (data: string, sessionId?: string) => void;
  subscribeToData: (callback: (payload: { data: string; sessionId?: string }) => void) => () => void;
};

function terminalThemeFromCss(): ITheme {
  const styles = getComputedStyle(document.documentElement);
  const readToken = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

  const background = readToken("--terminal-bg", "#11141e");
  const foreground = readToken("--terminal-fg", "#d5daed");
  const accent = readToken("--terminal-accent", "#b8bfd2");
  const muted = readToken("--terminal-muted", "#9ea5bc");

  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    selectionBackground: "rgba(142, 162, 255, 0.18)",
    selectionInactiveBackground: "rgba(142, 162, 255, 0.08)",
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

export function TerminalPanel({
  sessionId = "default",
  terminal,
  onStart,
  onStop,
  onResize,
  onData,
  subscribeToData,
}: TerminalPanelProps) {
  const viewportShellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollToBottom = useCallback(() => {
    const current = terminalRef.current;
    if (!current) return;
    current.scrollToBottom();
    current.focus();
    setShowScrollToBottom(false);
  }, []);

  useEffect(() => {
    const mount = containerRef.current;
    const viewportShell = viewportShellRef.current;
    if (!mount || !viewportShell) return;

    const xterm = new Terminal({
      cursorBlink: true,
      lineHeight: 1.18,
      fontSize: 12,
      scrollback: 5_000,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontWeight: "400",
      fontWeightBold: "600",
      letterSpacing: 0,
      theme: terminalThemeFromCss(),
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(mount);
    terminalRef.current = xterm;

    const syncScrollButtonVisibility = () => {
      const viewport = mount.querySelector(".xterm-viewport") as HTMLElement | null;
      if (!viewport) {
        setShowScrollToBottom(false);
        return;
      }

      const distanceFromBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      setShowScrollToBottom(distanceFromBottom > 12);
    };

    const fitAndResize = () => {
      fitAddon.fit();
      onResize(xterm.cols, xterm.rows, sessionId);
      syncScrollButtonVisibility();
    };

    const scheduleFit = () => {
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
      }

      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = null;
        fitAndResize();
      });
    };

    xterm.focus();
    scheduleFit();
    void Promise.resolve(onStart(sessionId)).then(() => scheduleFit());

    const viewport = mount.querySelector(".xterm-viewport") as HTMLElement | null;
    const handleViewportScroll = () => syncScrollButtonVisibility();
    viewport?.addEventListener("scroll", handleViewportScroll);

    const inputDisposable = xterm.onData((data) => onData(data, sessionId));
    const unsubscribe = subscribeToData((payload) => {
      const targetSessionId = payload.sessionId ?? "default";
      if (targetSessionId !== sessionId) return;
      xterm.write(payload.data);
      syncScrollButtonVisibility();
    });

    const resizeObserver = new ResizeObserver(() => scheduleFit());
    resizeObserver.observe(viewportShell);

    const themeObserver = new MutationObserver(() => {
      xterm.options.theme = terminalThemeFromCss();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      viewport?.removeEventListener("scroll", handleViewportScroll);
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
      }
      unsubscribe();
      inputDisposable.dispose();
      xterm.dispose();
      terminalRef.current = null;
      setShowScrollToBottom(false);
      void Promise.resolve(onStop(sessionId));
    };
  }, [onData, onResize, onStart, onStop, sessionId, subscribeToData]);

  const sessionState = terminal.sessions?.[sessionId] ?? null;
  const errorText = sessionState?.errorText ?? terminal.errorText;

  return (
    <section className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-l border-border/55 bg-background/60" aria-label="Project terminal">
      <div className="flex items-center justify-between border-b border-border/55 px-3 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Terminal</p>
          <p className="text-sm text-foreground">{sessionState?.cwd ?? terminal.cwd ?? "No cwd"}</p>
        </div>
        <span className="text-xs text-muted-foreground">{sessionState?.status ?? terminal.status}</span>
      </div>

      <div ref={viewportShellRef} className="relative min-h-0 flex-1 overflow-hidden p-2">
        <div className="terminal-viewport h-full bg-background">
          <div ref={containerRef} className="tui-terminal h-full w-full" />
        </div>

        {showScrollToBottom ? (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-5 right-5 h-8 w-8 rounded-full"
            onClick={scrollToBottom}
            aria-label="Scroll terminal to bottom"
          >
            ↓
          </Button>
        ) : null}
      </div>

      {errorText ? (
        <div className="mx-2 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorText}
        </div>
      ) : null}
    </section>
  );
}
