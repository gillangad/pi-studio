import type { ResourceEntrySummary, ResourceOrigin, ResourceSummary, SettingsState, StudioMode, StudioSnapshot } from "../../shared/types";
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

function groupResourceEntries(entries: ResourceEntrySummary[]) {
  return {
    bundled: entries
      .filter((entry) => entry.origin === "bundled")
      .sort((left, right) => left.name.localeCompare(right.name)),
    userInstalled: entries
      .filter((entry) => entry.origin === "userInstalled")
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function ResourceEntryList({
  heading,
  entries,
  emptyLabel,
}: {
  heading: string;
  entries: ResourceEntrySummary[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{heading}</p>
      {entries.length > 0 ? (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <div key={`${entry.origin}-${entry.name}-${entry.path ?? "no-path"}`} className="rounded-md border border-border/60 bg-background/55 px-3 py-2">
              <p className="text-sm font-medium text-foreground">{entry.name}</p>
              {entry.path ? (
                <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{entry.path}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function ResourceGroupCard({
  title,
  resources,
}: {
  title: string;
  resources: ResourceSummary;
}) {
  const extensions = groupResourceEntries(resources.extensionEntries);
  const skills = groupResourceEntries(resources.skillEntries);

  const sections: Array<{
    origin: ResourceOrigin;
    label: string;
    extensionEntries: ResourceEntrySummary[];
    skillEntries: ResourceEntrySummary[];
  }> = [
    {
      origin: "bundled",
      label: "Pi Studio bundled",
      extensionEntries: extensions.bundled,
      skillEntries: skills.bundled,
    },
    {
      origin: "userInstalled",
      label: "User installed",
      extensionEntries: extensions.userInstalled,
      skillEntries: skills.userInstalled,
    },
  ];

  return (
    <div className="rounded-xl border border-border/70 bg-background/35 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            {resources.extensions} extensions · {resources.skills} skills
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <div key={section.origin} className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{section.label}</p>
            <ResourceEntryList
              heading="Extensions"
              entries={section.extensionEntries}
              emptyLabel="No extensions loaded."
            />
            <ResourceEntryList
              heading="Skills"
              entries={section.skillEntries}
              emptyLabel="No skills loaded."
            />
          </div>
        ))}
      </div>
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
            value={`${snapshot.gui.resources.extensions + snapshot.master.resources.extensions} extensions · ${snapshot.gui.resources.skills + snapshot.master.resources.skills} skills`}
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

        <div className="grid min-h-0 gap-4 xl:grid-cols-2">
          <ResourceGroupCard title="Active GUI session" resources={snapshot.gui.resources} />
          <ResourceGroupCard title="Control surface resources" resources={snapshot.master.resources} />
        </div>
      </CardContent>
    </Card>
  );
}
