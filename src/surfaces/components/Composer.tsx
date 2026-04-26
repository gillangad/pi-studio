import { ChevronDown, Mic, Plus, Send, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AttachmentSummary, ModelSummary } from "../../shared/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type ComposerProps = {
  busy: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onAbort: () => Promise<unknown> | unknown;
  models: ModelSummary[];
  currentModel: ModelSummary | null;
  thinkingLevel: string;
  availableThinkingLevels: string[];
  attachments: AttachmentSummary[];
  onSetModel: (provider: string, modelId: string) => void;
  onSetThinkingLevel: (level: string) => void;
  onPickAttachments: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onClearAttachments: () => void;
};

const SLASH_COMMANDS = [
  {
    command: "/tree",
    description: "Navigate the session tree",
  },
];

export function Composer({
  busy,
  value,
  onValueChange,
  onSubmit,
  onAbort,
  models,
  currentModel,
  thinkingLevel,
  availableThinkingLevels,
  attachments,
  onSetModel,
  onSetThinkingLevel,
  onPickAttachments,
  onRemoveAttachment,
  onClearAttachments,
}: ComposerProps) {
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [abortRequested, setAbortRequested] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const providerOptions = useMemo(
    () => Array.from(new Set(models.map((model) => model.provider))),
    [models],
  );
  const selectedProvider = currentModel?.provider ?? providerOptions[0] ?? "";
  const modelsForProvider = useMemo(
    () => models.filter((model) => model.provider === selectedProvider),
    [models, selectedProvider],
  );
  const selectedModelId =
    currentModel && currentModel.provider === selectedProvider
      ? currentModel.id
      : (modelsForProvider[0]?.id ?? "");
  const selectedThinkingLevel = availableThinkingLevels.includes(thinkingLevel)
    ? thinkingLevel
    : (availableThinkingLevels[0] ?? "");

  useEffect(() => {
    if (!busy) {
      setAbortRequested(false);
    }
  }, [busy]);

  const showStopButton = busy && !abortRequested;
  const modelSummaryLabel = currentModel
    ? `${currentModel.provider} ${currentModel.name} ${selectedThinkingLevel}`
    : `No model ${selectedThinkingLevel}`;
  const slashQuery = value.trimStart();
  const slashSuggestions = useMemo(() => {
    if (!slashQuery.startsWith("/")) return [];
    return SLASH_COMMANDS.filter((entry) => entry.command.startsWith(slashQuery.toLowerCase()));
  }, [slashQuery]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const applySlashSuggestion = (command: string) => {
    onValueChange(command);
  };

  return (
    <div className="space-y-2.5">
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              onClick={() => onRemoveAttachment(attachment.id)}
              title="Remove attachment"
            >
              <span className="max-w-48 truncate">{attachment.name}</span>
              <X size={12} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="workspace-panel relative rounded-[28px] border border-border/70 bg-card/95 shadow-sm">
        <Textarea
          value={value}
          className="min-h-[110px] resize-y rounded-[28px] border-transparent bg-transparent pb-16 pr-24 pt-4 shadow-none focus-visible:ring-0"
          placeholder="Ask for follow-up changes"
          rows={3}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (slashSuggestions.length > 0 && event.key === "ArrowDown") {
              event.preventDefault();
              setSlashIndex((current) => (current + 1) % slashSuggestions.length);
              return;
            }

            if (slashSuggestions.length > 0 && event.key === "ArrowUp") {
              event.preventDefault();
              setSlashIndex((current) => (current - 1 + slashSuggestions.length) % slashSuggestions.length);
              return;
            }

            if (event.key !== "Enter") return;

            if (slashSuggestions.length > 0 && !event.shiftKey) {
              const selectedCommand = slashSuggestions[slashIndex]?.command ?? slashSuggestions[0]!.command;
              if (slashQuery.toLowerCase() !== selectedCommand) {
                event.preventDefault();
                applySlashSuggestion(selectedCommand);
                return;
              }

            }

            if (slashSuggestions.length > 0 && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
              return;
            }

            if (event.metaKey || event.ctrlKey || !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />

        {slashSuggestions.length > 0 ? (
          <div
            className="absolute left-4 right-4 top-[calc(100%-3.75rem)] z-20 overflow-hidden rounded-2xl border border-border/70 bg-popover/98 shadow-glass"
            role="listbox"
            aria-label="Slash commands"
          >
            {slashSuggestions.map((entry, index) => {
              const active = index === slashIndex;
              return (
                <button
                  key={entry.command}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={[
                    "flex w-full items-center justify-between gap-4 px-4 py-3 text-left",
                    active ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                  ].join(" ")}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySlashSuggestion(entry.command);
                  }}
                >
                  <span className="font-mono text-sm">{entry.command}</span>
                  <span className="text-xs">{entry.description}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onPickAttachments}
              aria-label="Add attachment"
              className="h-8 w-8 rounded-full text-muted-foreground"
            >
              <Plus size={18} />
            </Button>

            <div className="relative">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
                onClick={() => setAgentMenuOpen((current) => !current)}
                aria-expanded={agentMenuOpen}
                aria-haspopup="menu"
                aria-label={modelSummaryLabel}
              >
                <span className="truncate">{modelSummaryLabel}</span>
                <ChevronDown size={14} />
              </button>

              {agentMenuOpen ? (
                <div
                  className="absolute bottom-[calc(100%+8px)] left-0 z-20 grid min-w-[320px] gap-2 rounded-lg border border-border/70 bg-popover p-3 shadow-glass"
                  role="menu"
                  aria-label="Agent settings"
                >
                  <label className="grid gap-1 text-xs text-muted-foreground">
                    <span>Provider</span>
                    <select
                      value={selectedProvider}
                      aria-label="Provider"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
                      disabled={providerOptions.length === 0}
                      onChange={(event) => {
                        const provider = event.target.value;
                        if (!provider) return;
                        const firstModel = models.find((model) => model.provider === provider);
                        if (!firstModel) return;
                        onSetModel(firstModel.provider, firstModel.id);
                      }}
                    >
                      {providerOptions.length === 0 ? <option value="">No providers configured</option> : null}
                      {providerOptions.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs text-muted-foreground">
                    <span>Model</span>
                    <select
                      value={selectedModelId}
                      aria-label="Model"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
                      disabled={modelsForProvider.length === 0}
                      onChange={(event) => {
                        if (!selectedProvider || !event.target.value) return;
                        onSetModel(selectedProvider, event.target.value);
                      }}
                    >
                      {modelsForProvider.length === 0 ? <option value="">No models configured</option> : null}
                      {modelsForProvider.map((model) => (
                        <option key={`${model.provider}-${model.id}`} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs text-muted-foreground">
                    <span>Thinking</span>
                    <select
                      value={selectedThinkingLevel}
                      aria-label="Thinking"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
                      disabled={availableThinkingLevels.length === 0}
                      onChange={(event) => onSetThinkingLevel(event.target.value)}
                    >
                      {availableThinkingLevels.length === 0 ? <option value="">Unavailable</option> : null}
                      {availableThinkingLevels.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Voice input"
              className="h-8 w-8 rounded-full text-muted-foreground"
            >
              <Mic size={16} />
            </Button>

            {showStopButton ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-full bg-white text-black hover:bg-white/90"
                onClick={() => {
                  setAbortRequested(true);
                  void onAbort();
                }}
                aria-label="Stop"
              >
                <Square size={14} fill="currentColor" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 rounded-full bg-white text-black hover:bg-white/90"
                disabled={!value.trim()}
                onClick={onSubmit}
                aria-label="Send"
              >
                <Send size={15} />
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
