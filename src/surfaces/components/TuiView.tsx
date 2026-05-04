import "@wterm/react/css";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import type { GuiState, TuiState } from "../../shared/types";
import { buildTuiTranscript } from "../lib/tui-transcript";

type TuiViewProps = {
  gui: GuiState;
  tui: TuiState;
  draft: string;
  onDraftChange: (value: string) => void;
  onSendPrompt: (text: string, sessionId?: string) => Promise<unknown> | unknown;
  onAbort: (sessionId?: string) => Promise<unknown> | unknown;
  sessionId?: string;
  active?: boolean;
};

const CLEAR_SCREEN = "\u001b[2J\u001b[3J\u001b[H";

function isControlSequence(data: string) {
  return data.startsWith("\u001b");
}

function normalizeInput(data: string) {
  return data.replace(/\r/g, "").replace(/\n/g, " ");
}

export function TuiView({
  gui,
  tui,
  draft,
  onDraftChange,
  onSendPrompt,
  onAbort,
  sessionId,
  active = false,
}: TuiViewProps) {
  const { ref, write, focus } = useTerminal();
  const readyRef = useRef(false);
  const transcriptRef = useRef("");

  const transcript = useMemo(() => buildTuiTranscript(gui, draft), [draft, gui]);

  useEffect(() => {
    transcriptRef.current = transcript;
    if (!readyRef.current) return;
    write(`${CLEAR_SCREEN}${transcript}`);
  }, [transcript, write]);

  useEffect(() => {
    if (active && readyRef.current) {
      focus();
    }
  }, [active, focus]);

  const handleReady = useCallback(() => {
    readyRef.current = true;
    write(`${CLEAR_SCREEN}${transcriptRef.current}`);
    if (active) {
      focus();
    }
  }, [active, focus, write]);

  const handleData = useCallback(
    (data: string) => {
      if (data === "\u0003") {
        if (gui.isStreaming) {
          void onAbort(sessionId);
          return;
        }

        onDraftChange("");
        return;
      }

      if (data === "\r" || data === "\n") {
        const trimmed = draft.trim();
        if (!trimmed || gui.isStreaming) return;
        onDraftChange("");
        void onSendPrompt(trimmed, sessionId);
        return;
      }

      if (data === "\u007f" || data === "\b") {
        onDraftChange(draft.slice(0, -1));
        return;
      }

      if (isControlSequence(data)) {
        return;
      }

      const normalized = normalizeInput(data);
      if (!normalized) return;
      onDraftChange(draft + normalized);
    },
    [draft, gui.isStreaming, onAbort, onDraftChange, onSendPrompt, sessionId],
  );

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background" aria-label="Hosted terminal">
      <div className="flex items-center justify-between border-b border-border/55 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Studio TUI</p>
          <p className="truncate text-sm text-foreground">{gui.sessionTitle || "No thread selected"}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{gui.cwd ?? tui.cwd ?? "No cwd"}</p>
          <p>{gui.isStreaming ? "Generating" : tui.runningInBackground ? "Hot in background" : "Ready"}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-[var(--terminal-bg)]">
        <Terminal
          ref={ref}
          autoResize
          cursorBlink
          onReady={handleReady}
          onData={handleData}
          className="pi-studio-wterm h-full w-full"
        />
      </div>
    </section>
  );
}
