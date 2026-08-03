"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Search,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import { Badge } from "@/components/ui/ui-badge";
import { Switch } from "@/components/ui/ui-switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/ui-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/ui-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { useConfirm } from "@/components/confirm-provider";
import { cn } from "@/lib/cn";
import {
  upsertProvider,
  deleteProvider,
  fetchProviderModels,
  addProviderModel,
  updateProviderModel,
  deleteProviderModel,
  type ProviderView,
  type ProviderModelView,
} from "@/lib/actions/provider-actions";

type Protocol = "OPENAI" | "GOOGLE";

/**
 * Starting points for the endpoints people actually use, so nobody has to
 * remember a base URL. Everything stays editable afterwards.
 */
const PRESETS: {
  key: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  note: string;
}[] = [
  {
    key: "gemini",
    name: "Gemini",
    protocol: "GOOGLE",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    note: "Gemini Flash and Pro, on Google's native API.",
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    protocol: "OPENAI",
    baseUrl: "https://openrouter.ai/api/v1",
    note: "One key, many vendors' models.",
  },
  {
    key: "custom",
    name: "Custom",
    protocol: "OPENAI",
    baseUrl: "",
    note: "Any other OpenAI-compatible endpoint.",
  },
];

const PROTOCOL_LABELS: Record<Protocol, string> = {
  OPENAI: "OpenAI-compatible",
  GOOGLE: "Google (native Gemini API)",
};

/**
 * Manage the model endpoints behind engine mode PROVIDER.
 *
 * The API key is write-only here: the server sends back `hasKey`, never the key
 * itself, so an empty key field on edit means "keep the stored one".
 */
export function ProvidersCard({ providers }: { providers: ProviderView[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  // Either an existing provider, or a preset key for a new one.
  const [editing, setEditing] = React.useState<
    ProviderView | { preset: string } | null
  >(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API providers</CardTitle>
        <CardDescription>
          Gemini on Google&apos;s native API, or any endpoint speaking the OpenAI
          Chat Completions protocol. Changes here save immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <p
            role="alert"
            className="border-2 border-danger bg-danger/10 px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {providers.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="font-display font-semibold">No providers yet</p>
            <p className="max-w-md text-sm text-fg-muted">
              Add an endpoint, then fetch its models. The first model becomes the
              default until you pick another one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {providers.map((provider, i) => (
              <ProviderBlock
                key={provider.id}
                provider={provider}
                first={i === 0}
                busy={busy}
                onEdit={() => setEditing(provider)}
                onFetch={() =>
                  run(`fetch:${provider.id}`, async () => {
                    await fetchProviderModels(provider.id);
                  })
                }
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete ${provider.name}?`,
                    description:
                      "Its models are removed too. Tasks pointing at them fall back to the default model.",
                    confirmLabel: "Delete provider",
                    tone: "danger",
                  });
                  if (!ok) return;
                  await run(`del:${provider.id}`, async () => {
                    await deleteProvider(provider.id);
                  });
                }}
                onAddModel={(modelId) =>
                  run(`add:${provider.id}`, async () => {
                    await addProviderModel({
                      providerId: provider.id,
                      modelId,
                      supportsVision: false,
                    });
                  })
                }
                onToggleVision={(id, supportsVision) =>
                  run(`vision:${id}`, async () => {
                    await updateProviderModel({ id, supportsVision });
                  })
                }
                onDeleteModel={async (id, label) => {
                  const ok = await confirm({
                    title: `Remove ${label}?`,
                    description: "You can fetch or re-add it later.",
                    confirmLabel: "Remove model",
                    tone: "danger",
                  });
                  if (!ok) return;
                  await run(`delm:${id}`, async () => {
                    await deleteProviderModel(id);
                  });
                }}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wide text-fg-muted">
            Add
          </span>
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="sm"
              title={preset.note}
              onClick={() => setEditing({ preset: preset.key })}
            >
              <Plus className="size-4" />
              {preset.name}
            </Button>
          ))}
        </div>
      </CardContent>

      <ProviderDialog
        key={
          editing && "preset" in editing
            ? `new:${editing.preset}`
            : (editing?.id ?? "closed")
        }
        provider={editing && "preset" in editing ? null : editing}
        preset={editing && "preset" in editing ? editing.preset : null}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={async (input) => {
          await run("save", async () => {
            await upsertProvider(input);
            setEditing(null);
          });
        }}
        saving={busy === "save"}
      />
    </Card>
  );
}

/**
 * One endpoint and its models. Separated by a rule rather than wrapped in its
 * own border: a bordered box inside the card's border reads as a second card.
 */
function ProviderBlock({
  provider,
  first,
  busy,
  onEdit,
  onFetch,
  onDelete,
  onAddModel,
  onToggleVision,
  onDeleteModel,
}: {
  provider: ProviderView;
  first: boolean;
  busy: string | null;
  onEdit: () => void;
  onFetch: () => void;
  onDelete: () => void;
  onAddModel: (modelId: string) => void;
  onToggleVision: (id: string, supportsVision: boolean) => void;
  onDeleteModel: (id: string, label: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [manualId, setManualId] = React.useState("");
  const fetching = busy === `fetch:${provider.id}`;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return provider.models;
    return provider.models.filter(
      (m) =>
        m.modelId.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q),
    );
  }, [provider.models, query]);

  return (
    <section
      className={cn(
        "flex flex-col gap-4 py-5",
        first ? "pt-0" : "border-t-2 border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-base font-semibold">
              {provider.name}
            </h4>
            <Badge tone={provider.protocol === "GOOGLE" ? "accent" : "surface"}>
              {provider.protocol === "GOOGLE" ? "Google" : "OpenAI"}
            </Badge>
            {provider.enabled ? null : <Badge tone="muted">Disabled</Badge>}
            {provider.hasKey ? null : <Badge tone="danger">No API key</Badge>}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-fg-muted">
            {provider.baseUrl}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={onFetch} disabled={fetching}>
            {fetching ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Fetch models
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            aria-label={`Edit ${provider.name}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            aria-label={`Delete ${provider.name}`}
            className="text-danger"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {provider.models.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No models yet. Fetch them from the endpoint, or add one by id below.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* A gateway can list hundreds of models; scrolling alone does not
              make one findable, so the list is filterable as well as bounded. */}
          {provider.models.length > 8 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${provider.models.length} models`}
                aria-label={`Filter ${provider.name} models`}
                className="h-9 pl-8 font-mono text-xs"
              />
            </div>
          ) : null}

          <div className="max-h-72 overflow-y-auto border-2 border-border-soft">
            {matches.length === 0 ? (
              <p className="p-3 text-sm text-fg-muted">
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <ul className="divide-y-2 divide-border-soft">
                {matches.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    onToggleVision={onToggleVision}
                    onDelete={onDeleteModel}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">
            {query
              ? `${matches.length} of ${provider.models.length} models`
              : `${provider.models.length} models`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && manualId.trim()) {
              onAddModel(manualId.trim());
              setManualId("");
            }
          }}
          placeholder="Add a model by id, e.g. anthropic/claude-sonnet-5"
          aria-label={`Add a model to ${provider.name}`}
          className="h-9 max-w-md font-mono text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!manualId.trim()}
          onClick={() => {
            onAddModel(manualId.trim());
            setManualId("");
          }}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </section>
  );
}

function ModelRow({
  model,
  onToggleVision,
  onDelete,
}: {
  model: ProviderModelView;
  onToggleVision: (id: string, supportsVision: boolean) => void;
  onDelete: (id: string, label: string) => void;
}) {
  const price =
    model.inputPricePerM !== null && model.outputPricePerM !== null
      ? `$${model.inputPricePerM} / $${model.outputPricePerM} per M`
      : null;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs">{model.modelId}</p>
        <p className="mt-0.5 truncate text-[11px] text-fg-muted">
          {[
            model.contextWindow
              ? `${Math.round(model.contextWindow / 1000)}k context`
              : null,
            price,
            model.source === "MANUAL" ? "added by hand" : null,
          ]
            .filter(Boolean)
            .join(" · ") || model.label}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-fg-muted">
          Vision
          <Switch
            checked={model.supportsVision}
            onCheckedChange={(v) => onToggleVision(model.id, v)}
            aria-label={`${model.modelId} supports vision`}
          />
        </label>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger"
          aria-label={`Remove ${model.modelId}`}
          onClick={() => onDelete(model.id, model.modelId)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function ProviderDialog({
  provider,
  preset,
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  provider: ProviderView | null;
  /** Preset key when adding, so the form opens pre-filled. */
  preset: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const seed = PRESETS.find((p) => p.key === preset);
  const [name, setName] = React.useState(provider?.name ?? seed?.name ?? "");
  const [protocol, setProtocol] = React.useState<Protocol>(
    provider?.protocol ?? seed?.protocol ?? "OPENAI",
  );
  const [baseUrl, setBaseUrl] = React.useState(
    provider?.baseUrl ?? seed?.baseUrl ?? "",
  );
  const [apiKey, setApiKey] = React.useState("");
  const [enabled, setEnabled] = React.useState(provider?.enabled ?? true);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const caps = (provider?.capabilities ?? {}) as Record<string, unknown>;
  const [parallelToolCalls, setParallelToolCalls] = React.useState(
    caps.parallelToolCalls !== false,
  );
  const [strictSchemas, setStrictSchemas] = React.useState(
    caps.strictSchemas === true,
  );
  const [developerRole, setDeveloperRole] = React.useState(
    caps.systemRole === "developer",
  );
  const [maxSteps, setMaxSteps] = React.useState(String(caps.maxSteps ?? 60));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider ? "Edit provider" : "Add provider"}</DialogTitle>
          <DialogDescription>
            The base URL is the root the endpoint appends its paths to.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="OpenRouter"
            />
          </Field>
          <Field
            label="Protocol"
            hint={
              protocol === "GOOGLE"
                ? "Gemini's own API. Required for tools: its OpenAI-compatible endpoint cannot run them."
                : "Chat Completions, as spoken by OpenAI and every compatible gateway."
            }
          >
            <Select
              value={protocol}
              onValueChange={(v) => {
                const next = v as Protocol;
                setProtocol(next);
                // Moving to Google without a URL of your own is almost always
                // the public endpoint; offer it rather than making them look it up.
                if (next === "GOOGLE" && !baseUrl.trim()) {
                  setBaseUrl(PRESETS[0].baseUrl);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPENAI">{PROTOCOL_LABELS.OPENAI}</SelectItem>
                <SelectItem value="GOOGLE">{PROTOCOL_LABELS.GOOGLE}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Base URL">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                protocol === "GOOGLE"
                  ? "https://generativelanguage.googleapis.com/v1beta"
                  : "https://openrouter.ai/api/v1"
              }
              className="font-mono"
            />
          </Field>
          <Field
            label="API key"
            hint={
              provider?.hasKey
                ? "A key is saved. Leave this empty to keep it, or type a new one to replace it."
                : "Stored encrypted. Never sent back to the browser."
            }
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider?.hasKey ? "••••••••" : "Paste the API key"}
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Enabled
          </label>

          {protocol === "OPENAI" ? (
            <button
              type="button"
              className="w-fit font-mono text-xs uppercase tracking-wide text-fg-muted underline underline-offset-4 outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "Show"} compatibility options
            </button>
          ) : null}

          {showAdvanced && protocol === "OPENAI" ? (
            <div className="flex flex-col gap-3 border-2 border-border-soft p-3">
              <p className="text-xs text-fg-muted">
                Only change these if runs fail against this endpoint.
                &ldquo;OpenAI-compatible&rdquo; is a family, not one protocol.
              </p>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Switch
                  checked={parallelToolCalls}
                  onCheckedChange={setParallelToolCalls}
                />
                Allow parallel tool calls
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Switch checked={strictSchemas} onCheckedChange={setStrictSchemas} />
                Endpoint supports strict JSON schemas
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <Switch checked={developerRole} onCheckedChange={setDeveloperRole} />
                Send instructions as the &ldquo;developer&rdquo; role
              </label>
              <Field label="Max steps per run" hint="Ceiling on agent turns.">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(e.target.value)}
                  className="max-w-32"
                />
              </Field>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !baseUrl.trim() || saving}
            onClick={() =>
              onSave({
                id: provider?.id,
                name: name.trim(),
                protocol,
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim() || undefined,
                enabled,
                capabilities: {
                  parallelToolCalls,
                  strictSchemas,
                  systemRole: developerRole ? "developer" : "system",
                  maxSteps: Number(maxSteps) || 60,
                },
              })
            }
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Save provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
