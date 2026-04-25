import type { SettingsState, StudioMode, StudioSnapshot } from "../../shared/types";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type SettingsViewProps = {
  settings: SettingsState;
  snapshot: StudioSnapshot;
  onOpenMode: (mode: StudioMode) => void;
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground break-words">{value}</p>
    </div>
  );
}

export function SettingsView({ settings, snapshot, onOpenMode }: SettingsViewProps) {
  return (
    <Card className="flex h-full min-h-0 w-full flex-col overflow-hidden border-border/70 bg-card/80">
      <CardHeader>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Settings</p>
        <CardTitle>Workspace and runtime</CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Agent directory" value={settings.agentDir ?? "Unknown"} />
          <StatCard label="Current project" value={settings.currentProjectPath ?? "None selected"} />
          <StatCard label="Current session" value={settings.currentSessionFile ?? "No active session"} />
          <StatCard label="Current mode" value={settings.currentMode} />
          <StatCard label="Projects" value={String(snapshot.projects.length)} />
          <StatCard
            label="Resources"
            value={`${snapshot.gui.resources.extensions} extensions · ${snapshot.gui.resources.skills} skills`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenMode("extensions")}>
            Open extensions surface
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenMode("skills")}>
            Open skills surface
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenMode("git")}>
            Open git/diff surface
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
