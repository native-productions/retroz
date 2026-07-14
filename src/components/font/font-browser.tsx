"use client";

import * as React from "react";
import { Search, LoaderCircle, Plus, Check, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/ui-input";
import { Button } from "@/components/ui/ui-button";
import { Badge } from "@/components/ui/ui-badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import { cn } from "@/lib/cn";
import { FONT_CATEGORIES } from "@/lib/font-category";
import { addGoogleFont } from "@/lib/actions/font-actions";

interface Entry {
  family: string;
  category: string;
  popularity: number;
  trending: number;
}

export function FontBrowser({
  existingFamilies,
  onAdded,
}: {
  existingFamilies: string[];
  onAdded: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("ALL");
  const [sort, setSort] = React.useState("popular");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [adding, setAdding] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState<Set<string>>(
    new Set(existingFamilies),
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchResults = React.useCallback(
    async (query: string, cat: string, s: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, category: cat, sort: s });
        const res = await fetch(`/api/fonts/catalog?${params}`);
        const data = await res.json();
        setEntries(data.entries ?? []);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchResults(q, category, sort), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, category, sort, fetchResults]);

  async function add(family: string) {
    setAdding(family);
    try {
      await addGoogleFont({ input: family });
      setAdded((prev) => new Set(prev).add(family));
      onAdded();
    } catch {
      /* ignore, surfaced elsewhere */
    } finally {
      setAdding(null);
    }
  }

  // live preview: load visible families from Google (browse-time only)
  const previewHref =
    entries.length > 0
      ? `https://fonts.googleapis.com/css2?${entries
          .slice(0, 60)
          .map((e) => `family=${e.family.replace(/\s+/g, "+")}`)
          .join("&")}&display=swap`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {previewHref ? (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={previewHref} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Google Fonts…"
            className="pl-8"
            autoFocus
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {FONT_CATEGORIES.filter((c) => c.value !== "OTHER").map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popular">Popular</SelectItem>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="name">A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="max-h-[46vh] overflow-y-auto flex flex-col gap-2 pr-1">
        {loading && entries.length === 0 ? (
          <div className="grid place-items-center py-10 text-fg-muted">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">
            No fonts found.
          </p>
        ) : (
          entries.map((e) => {
            const isAdded = added.has(e.family);
            return (
              <div
                key={e.family}
                className="retro-card flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-2xl leading-tight"
                    style={{ fontFamily: `'${e.family}', sans-serif` }}
                  >
                    {e.family}
                  </p>
                  <p className="flex items-center gap-2 text-[10px] text-fg-muted font-mono">
                    {e.category}
                    {sort === "trending" ? (
                      <span className="inline-flex items-center gap-0.5">
                        <TrendingUp className="size-3" /> #{e.trending}
                      </span>
                    ) : null}
                  </p>
                </div>
                {isAdded ? (
                  <Badge tone="primary">
                    <Check className="size-3" /> in bank
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => add(e.family)}
                    disabled={adding === e.family}
                    className={cn(adding === e.family && "opacity-70")}
                  >
                    {adding === e.family ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    Add
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
