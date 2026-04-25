import { X } from "lucide-react";
import { cn } from "../lib/utils";

type ThreadTab = {
  projectId: string;
  sessionFile: string;
  title: string;
  isActive: boolean;
};

type ThreadTabsProps = {
  tabs: ThreadTab[];
  onActivate: (projectId: string, sessionFile: string) => void;
  onClose: (projectId: string, sessionFile: string) => void;
};

export function ThreadTabs({ tabs, onActivate, onClose }: ThreadTabsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border/70 bg-card/70 p-1" role="tablist" aria-label="Open threads">
      {tabs.map((tab) => (
        <div key={`${tab.projectId}:${tab.sessionFile}`} className="inline-flex items-center gap-1 rounded-md bg-background/40 p-0.5" data-active={tab.isActive ? "true" : "false"}>
          <button
            type="button"
            role="tab"
            aria-selected={tab.isActive}
            className={cn(
              "max-w-48 truncate rounded-md px-2 py-1 text-xs transition-colors",
              tab.isActive ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onActivate(tab.projectId, tab.sessionFile)}
            title={tab.title}
          >
            {tab.title}
          </button>

          <button
            type="button"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
            aria-label={`Close ${tab.title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose(tab.projectId, tab.sessionFile);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
