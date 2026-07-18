"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  LoaderCircle,
  ImagePlus,
  Search,
  Check,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useImagePaste } from "@/lib/use-image-paste";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/ui-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/ui-tabs";
import type { StockPhoto, StockSource } from "@/lib/stock";

interface Scope {
  folderId?: string;
  workflowId?: string;
}

interface Provider {
  source: StockSource;
  label: string;
  endpoint: string;
  /** True when the provider needs an API key (gated by `pexelsEnabled`). */
  requiresKey: boolean;
}

const PROVIDERS: Provider[] = [
  { source: "pexels", label: "Pexels", endpoint: "/api/pexels/search", requiresKey: true },
  {
    source: "wikimedia",
    label: "Wikimedia",
    endpoint: "/api/wikimedia/search",
    requiresKey: false,
  },
];

export function AssetSourceDialog({
  scope,
  description,
  pexelsEnabled,
  accept = "image/png,image/jpeg,image/webp",
  allowSvg = false,
  triggerLabel = "Add photos",
  triggerVariant = "primary",
  triggerSize = "sm",
  pexelsQuery = "",
  title = "Add photos",
  onImported,
}: {
  scope: Scope;
  /** Seeds each folder Asset's description (campaign requested-photo label). */
  description?: string;
  /** Whether the Pexels key is configured (only gates the Pexels tab). */
  pexelsEnabled: boolean;
  accept?: string;
  allowSvg?: boolean;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  /** Initial stock search term (e.g. the request label). */
  pexelsQuery?: string;
  title?: string;
  /** Runs after a successful upload/import, before the dialog closes. */
  onImported?: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);

  async function done() {
    await onImported?.();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          <ImagePlus className="size-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(94vw,44rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload your own, or pull a free stock photo from Pexels or Wikimedia
            Commons.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* Only mount the panels while open so paste listeners live with the dialog. */}
          {open ? (
            <SourceTabs
              scope={scope}
              description={description}
              pexelsEnabled={pexelsEnabled}
              accept={accept}
              allowSvg={allowSvg}
              stockQuery={pexelsQuery}
              onDone={done}
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SourceTabs({
  scope,
  description,
  pexelsEnabled,
  accept,
  allowSvg,
  stockQuery,
  onDone,
}: {
  scope: Scope;
  description?: string;
  pexelsEnabled: boolean;
  accept: string;
  allowSvg: boolean;
  stockQuery: string;
  onDone: () => void;
}) {
  const [tab, setTab] = React.useState("upload");

  function locked(p: Provider) {
    return p.requiresKey && !pexelsEnabled;
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="upload">Upload</TabsTrigger>
        {PROVIDERS.map((p) => (
          <TabsTrigger key={p.source} value={p.source} disabled={locked(p)}>
            {locked(p) ? <Lock className="mr-1 size-3" /> : null}
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="upload">
        <UploadPanel
          scope={scope}
          description={description}
          accept={accept}
          allowSvg={allowSvg}
          onDone={onDone}
        />
      </TabsContent>

      {PROVIDERS.map((p) => (
        <TabsContent key={p.source} value={p.source}>
          {locked(p) ? (
            <p className="py-6 text-center font-mono text-xs text-fg-muted">
              Add a Pexels API key in Settings to enable stock search.
            </p>
          ) : (
            <StockPanel
              provider={p}
              scope={scope}
              description={description}
              initialQuery={stockQuery}
              onDone={onDone}
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

// --- Upload (drag / click / paste) ---
function UploadPanel({
  scope,
  description,
  accept,
  allowSvg,
  onDone,
}: {
  scope: Scope;
  description?: string;
  accept: string;
  allowSvg: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(
        (f) =>
          f.type.startsWith("image/") ||
          (allowSvg && f.type === "image/svg+xml"),
      );
      if (list.length === 0) return;
      setBusy(true);
      setError(null);
      const form = new FormData();
      if (scope.folderId) form.append("folderId", scope.folderId);
      if (scope.workflowId) form.append("workflowId", scope.workflowId);
      if (description) form.append("description", description);
      list.forEach((f) => form.append("files", f));
      try {
        const res = await fetch("/api/assets/upload", {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(await res.text());
        router.refresh();
        onDone();
      } catch {
        setError("Upload failed. Check the file type and try again.");
      } finally {
        setBusy(false);
      }
    },
    [scope.folderId, scope.workflowId, description, allowSvg, router, onDone],
  );

  useImagePaste((files) => upload(files));

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={cn(
          "grid place-items-center gap-2 rounded-[var(--radius-retro)] border-2 border-dashed p-10 text-center cursor-pointer transition-colors outline-none",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border-soft hover:border-border bg-surface-2/40",
        )}
      >
        {busy ? (
          <LoaderCircle className="size-6 animate-spin text-secondary" />
        ) : (
          <UploadCloud className="size-6 text-secondary" />
        )}
        <p className="text-sm font-medium">
          {busy ? "Uploading…" : "Drop, click, or paste photos"}
        </p>
        <p className="font-mono text-xs text-fg-muted">
          {allowSvg ? "PNG · JPG · WebP · SVG" : "PNG · JPG · WebP"} · ⌘/Ctrl+V
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

// --- Stock provider (search + multi-select import) ---
function StockPanel({
  provider,
  scope,
  description,
  initialQuery,
  onDone,
}: {
  provider: Provider;
  scope: Scope;
  description?: string;
  initialQuery: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [photos, setPhotos] = React.useState<StockPhoto[]>([]);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [searching, setSearching] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searched, setSearched] = React.useState(false);

  const search = React.useCallback(
    async (q: string) => {
      const term = q.trim();
      if (!term) return;
      setSearching(true);
      setError(null);
      setPicked(new Set());
      try {
        const res = await fetch(
          `${provider.endpoint}?query=${encodeURIComponent(term)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setPhotos(data.photos as StockPhoto[]);
        setSearched(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
        setPhotos([]);
      } finally {
        setSearching(false);
      }
    },
    [provider.endpoint],
  );

  // Kick off the seeded search once on mount.
  React.useEffect(() => {
    if (initialQuery.trim()) search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function importPicked() {
    const chosen = photos.filter((p) => picked.has(p.id));
    if (chosen.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: provider.source,
          folderId: scope.folderId,
          workflowId: scope.workflowId,
          description,
          photos: chosen.map((p) => ({
            id: p.id,
            url: p.full,
            alt: p.alt,
            mime: p.mime,
            attribution: p.attribution,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${provider.label} — e.g. coffee shop, sunset`}
          autoFocus
        />
        <Button type="submit" size="md" disabled={searching || !query.trim()}>
          {searching ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Search
        </Button>
      </form>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="max-h-[46vh] overflow-y-auto">
        {searching ? (
          <p className="py-8 text-center font-mono text-xs text-fg-muted">
            Searching…
          </p>
        ) : photos.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs text-fg-muted">
            {searched ? "No results. Try another term." : "Search to see photos."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => {
              const on = picked.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  title={p.attribution || p.alt}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-[var(--radius-retro)] border-2 shadow-hard-sm outline-none transition-colors",
                    on ? "border-primary" : "border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.thumb}
                    alt={p.alt}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                  {on ? (
                    <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-primary text-primary-fg">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                  {p.attribution ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left font-mono text-[9px] text-white">
                      {p.attribution}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t-2 border-border pt-3">
        <p className="font-mono text-[11px] text-fg-muted">
          {provider.source === "wikimedia"
            ? "Check each photo's license before publishing"
            : "Photos via Pexels"}{" "}
          · {picked.size} selected
        </p>
        <Button
          onClick={importPicked}
          disabled={picked.size === 0 || importing}
          size="sm"
        >
          {importing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          Add {picked.size > 0 ? picked.size : ""} photo
          {picked.size === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
