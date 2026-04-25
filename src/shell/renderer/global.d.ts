import type { HTMLAttributes } from "react";
import type { DesktopBridge } from "../../shared/ipc";

declare global {
  interface Window {
    piStudio: DesktopBridge;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string | boolean;
      };
    }
  }
}

export {};
