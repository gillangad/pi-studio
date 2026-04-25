import { ArrowLeft, ArrowRight, Globe, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BrowserCdpTarget } from "../../shared/ipc";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type BrowserPanelProps = {
  threadKey: string;
  initialUrl: string;
  onUrlChange: (url: string) => void;
};

type WebviewElement = HTMLElement & {
  loadURL?: (url: string) => void;
  getURL?: () => string;
  getTitle?: () => string;
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
};

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "https://example.com";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function BrowserPanel({ threadKey, initialUrl, onUrlChange }: BrowserPanelProps) {
  const webviewRef = useRef<WebviewElement | null>(null);
  const [address, setAddress] = useState(() => normalizeUrl(initialUrl));
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [cdpTarget, setCdpTarget] = useState<BrowserCdpTarget | null>(null);

  const normalizedInitialUrl = useMemo(() => normalizeUrl(initialUrl), [initialUrl]);

  useEffect(() => {
    setAddress(normalizedInitialUrl);
    setCanGoBack(false);
    setCanGoForward(false);
    setCdpTarget(null);
  }, [normalizedInitialUrl, threadKey]);

  const syncStateFromWebview = () => {
    const webview = webviewRef.current;
    if (!webview) return;

    const currentUrl = webview.getURL?.() || address;
    const currentTitle = webview.getTitle?.() || "";

    setAddress(currentUrl);
    onUrlChange(currentUrl);
    setCanGoBack(Boolean(webview.canGoBack?.()));
    setCanGoForward(Boolean(webview.canGoForward?.()));

    void window.piStudio
      .getBrowserCdpTarget({
        url: currentUrl,
        title: currentTitle,
      })
      .then((target) => {
        setCdpTarget(target);
      })
      .catch(() => {
        setCdpTarget(null);
      });
  };

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const onDidNavigate = () => syncStateFromWebview();
    const onDidStopLoading = () => syncStateFromWebview();

    webview.addEventListener("did-navigate", onDidNavigate as EventListener);
    webview.addEventListener("did-stop-loading", onDidStopLoading as EventListener);
    webview.addEventListener("did-navigate-in-page", onDidNavigate as EventListener);

    return () => {
      webview.removeEventListener("did-navigate", onDidNavigate as EventListener);
      webview.removeEventListener("did-stop-loading", onDidStopLoading as EventListener);
      webview.removeEventListener("did-navigate-in-page", onDidNavigate as EventListener);
    };
  }, [threadKey]);

  const navigate = () => {
    const next = normalizeUrl(address);
    setAddress(next);
    onUrlChange(next);
    webviewRef.current?.loadURL?.(next);
  };

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border/55 bg-background/60" aria-label="Agent browser surface">
      <header className="space-y-2 border-b border-border/55 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Button type="button" size="icon" variant="ghost" onClick={() => webviewRef.current?.goBack?.()} disabled={!canGoBack}>
            <ArrowLeft size={14} />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => webviewRef.current?.goForward?.()}
            disabled={!canGoForward}
          >
            <ArrowRight size={14} />
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={() => webviewRef.current?.reload?.()}>
            <RefreshCw size={14} />
          </Button>

          <div className="relative flex-1">
            <Globe size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-7"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  navigate();
                }
              }}
              aria-label="Browser address"
            />
          </div>

          <Button type="button" size="sm" variant="outline" onClick={navigate}>
            Go
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <Badge variant={cdpTarget ? "success" : "outline"}>{cdpTarget ? "Agent browser: ready" : "Agent browser: waiting"}</Badge>
          {cdpTarget?.webSocketDebuggerUrl ? (
            <code className="max-w-[58%] truncate rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px]">
              {cdpTarget.webSocketDebuggerUrl}
            </code>
          ) : null}
        </div>
      </header>

      <webview
        ref={(node) => {
          webviewRef.current = node as WebviewElement | null;
        }}
        className="h-full w-full min-h-0 flex-1 bg-background"
        src={normalizedInitialUrl}
      />
    </aside>
  );
}
