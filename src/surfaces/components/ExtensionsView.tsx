import type { GuiState } from "../../shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type ExtensionsViewProps = {
  gui: GuiState;
};

export function ExtensionsView({ gui }: ExtensionsViewProps) {
  return (
    <Card className="flex h-full min-h-0 w-full flex-col border-border/70 bg-card/80">
      <CardHeader>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Feature surface</p>
        <CardTitle>Extensions</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {gui.resources.extensionNames.map((name) => (
            <article key={name} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm font-medium">
              {name}
            </article>
          ))}
          {gui.resources.extensionNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extensions discovered in this project.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
