import type { StudioMode } from "../../shared/types";
import { cn } from "../lib/utils";

type ModeSwitcherProps = {
  activeMode: StudioMode;
  onSelectMode: (mode: StudioMode) => void;
};

const MODES: Array<{ id: StudioMode; label: string }> = [
  { id: "gui", label: "GUI" },
  { id: "cockpit", label: "Cockpit" },
  { id: "tui", label: "TUI" },
];

export function ModeSwitcher({ activeMode, onSelectMode }: ModeSwitcherProps) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/70 bg-background/60 p-1" role="tablist" aria-label="Workspace modes">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={mode.id === activeMode}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            mode.id === activeMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onSelectMode(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
