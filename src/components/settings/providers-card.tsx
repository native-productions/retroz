"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  Eye,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
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
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/ui-select";
import { useConfirm } from "@/components/confirm-provider";
import {
  upsertProvider,
  deleteProvider,
  fetchProviderModels,
  addProviderModel,
  updateProviderModel,
  deleteProviderModel,
  type ProviderView,
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
export function ProvidersCard({
  providers,
  defaultModelId,
  onDefaultModelChange,
}: {
  providers: ProviderView[];
  defaultModelId: string | null;
  onDefaultModelChange: (id: string) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  // Either an existing provider, or a preset key for a new one.
  const [editing, setEditing] = React.useState<
    ProviderView | { preset: string } | null
  >(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasModels = providers.some((p) => p.models.length > 0);

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
          Chat Completions protocol — a gateway, a vendor&apos;s compatible URL,
          or a server on your machine.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? (
          <p className="border-2 border-danger bg-danger/10 px-3 py-2 text-sm text-fg">
            {error}
          </p>
        ) : null}

        {providers.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No providers yet. Add one, then fetch its models.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {providers.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
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
                onAddModel={(input) =>
                  run(`add:${provider.id}`, async () => {
                    await addProviderModel({ ...input, providerId: provider.id });
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

        {hasModels ? (
          <Field
            label="Default model"
            hint="Used when nothing (task, workflow, project, campaign) picks a model."
          >
            <Select
              value={defaultModelId ?? ""}
              onValueChange={onDefaultModelChange}
            >
              <SelectTrigger className="max-w-lg">
                <SelectValue placeholder="Pick a model" />
              </SelectTrigger>
              <SelectContent>
                {providers
                  .filter((p) => p.models.length > 0)
                  .map((p) => (
                    <SelectGroup key={p.id}>
                      <SelectLabel>{p.name}</SelectLabel>
                      {p.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
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

function ProviderRow({
  provider,
  busy,
  onEdit,
  onFetch,
  onDelete,
  onAddModel,
  onToggleVision,
  onDeleteModel,
}: {
  provider: ProviderView;
  busy: string | null;
  onEdit: () => void;
  onFetch: () => void;
  onDelete: () => void;
  onAddModel: (input: { modelId: string; supportsVision: boolean }) => void;
  onToggleVision: (id: string, supportsVision: boolean) => void;
  onDeleteModel: (id: string, label: string) => void;
}) {
  const [manualId, setManualId] = React.useState("");
  const fetching = busy === `fetch:${provider.id}`;

  return (
    <div className="border-2 border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-semibold">{provider.name}</p>
          <p className="truncate font-mono text-xs text-fg-muted">
            {provider.baseUrl}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {provider.hasKey ? "API key saved" : "⚠ No API key"} ·{" "}
            {provider.models.length} model
            {provider.models.length === 1 ? "" : "s"}
            {provider.enabled ? "" : " · disabled"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onFetch} disabled={fetching}>
            {fetching ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Fetch models
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edit provider">
            <Pencil className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            aria-label="Delete provider"
            className="text-danger"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {provider.models.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y-2 divide-border border-t-2 border-border">
          {provider.models.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{m.label}</p>
                <p className="truncate font-mono text-xs text-fg-muted">
                  {m.modelId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <Eye className="size-3.5" />
                  Vision
                  <Switch
                    checked={m.supportsVision}
                    onCheckedChange={(v) => onToggleVision(m.id, v)}
                  />
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  aria-label={`Remove ${m.label}`}
                  onClick={() => onDeleteModel(m.id, m.label)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="Add a model id by hand, e.g. anthropic/claude-sonnet-4.5"
          className="max-w-md font-mono"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!manualId.trim()}
          onClick={() => {
            onAddModel({ modelId: manualId.trim(), supportsVision: false });
            setManualId("");
          }}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
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
            The base URL is the root the endpoint appends /chat/completions to.
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
                ? "Gemini's own API. Required for tools — its OpenAI-compatible endpoint cannot run them."
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
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            Enabled
          </label>

          {protocol === "OPENAI" ? (
            <button
              type="button"
              className="w-fit text-xs font-mono uppercase tracking-wide text-fg-muted underline"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "Show"} compatibility options
            </button>
          ) : null}

          {showAdvanced && protocol === "OPENAI" ? (
            <div className="flex flex-col gap-3 border-2 border-border p-3">
              <p className="text-xs text-fg-muted">
                Only change these if runs fail against this endpoint.
                &quot;OpenAI-compatible&quot; is a family, not one protocol.
              </p>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={parallelToolCalls}
                  onCheckedChange={setParallelToolCalls}
                />
                Allow parallel tool calls
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={strictSchemas} onCheckedChange={setStrictSchemas} />
                Endpoint supports strict JSON schemas
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={developerRole} onCheckedChange={setDeveloperRole} />
                Send instructions as the &quot;developer&quot; role
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
