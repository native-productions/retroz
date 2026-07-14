"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, LoaderCircle, Type, Link2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Input } from "@/components/ui/ui-input";
import { Field } from "@/components/ui/ui-label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/ui-tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/ui-select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/ui-dialog";
import { FONT_CATEGORIES } from "@/lib/font-category";
import { FontBrowser } from "@/components/font/font-browser";
import { addGoogleFont, addUrlFont } from "@/lib/actions/font-actions";

export function FontAddDialog({
  existingFamilies = [],
}: {
  existingFamilies?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // google
  const [gInput, setGInput] = React.useState("");
  // url
  const [uFamily, setUFamily] = React.useState("");
  const [uUrl, setUUrl] = React.useState("");
  const [uCat, setUCat] = React.useState("SANS");
  const [uMood, setUMood] = React.useState("");
  // upload
  const uploadRef = React.useRef<HTMLInputElement>(null);

  function done() {
    setLoading(false);
    setOpen(false);
    setError(null);
    setGInput("");
    setUFamily("");
    setUUrl("");
    router.refresh();
  }

  async function submitGoogle() {
    if (!gInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await addGoogleFont({ input: gInput });
      done();
    } catch {
      setError("Could not fetch that font from Google Fonts.");
      setLoading(false);
    }
  }

  async function submitUrl() {
    if (!uFamily.trim() || !uUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await addUrlFont({
        family: uFamily,
        url: uUrl,
        category: uCat,
        moodTags: uMood || undefined,
      });
      done();
    } catch {
      setError("Download failed. Check the URL points to a font file.");
      setLoading(false);
    }
  }

  async function submitUpload(files: FileList) {
    setLoading(true);
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    try {
      const res = await fetch("/api/fonts/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error();
      done();
    } catch {
      setError("Upload failed. Use .woff2 / .woff / .ttf / .otf.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Add font
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add font to bank</DialogTitle>
          <DialogDescription>
            From Google Fonts, a direct URL, or your own files.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Tabs defaultValue="google">
            <TabsList>
              <TabsTrigger value="google">
                <Type className="size-3.5" /> Google
              </TabsTrigger>
              <TabsTrigger value="url">
                <Link2 className="size-3.5" /> URL
              </TabsTrigger>
              <TabsTrigger value="upload">
                <UploadCloud className="size-3.5" /> Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="google" className="flex flex-col gap-4">
              <FontBrowser
                existingFamilies={existingFamilies}
                onAdded={() => router.refresh()}
              />
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wide text-fg-muted">
                <span className="h-px flex-1 bg-border-soft" /> or add by name /
                url <span className="h-px flex-1 bg-border-soft" />
              </div>
              <div className="flex items-end gap-2">
                <Field
                  label="Family or Google Fonts URL"
                  className="flex-1"
                  hint="e.g. “Space Grotesk” or a specimen URL"
                >
                  <Input
                    value={gInput}
                    onChange={(e) => setGInput(e.target.value)}
                    placeholder="Space Grotesk"
                  />
                </Field>
                <Button onClick={submitGoogle} disabled={loading}>
                  {loading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="url" className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Family name">
                  <Input
                    value={uFamily}
                    onChange={(e) => setUFamily(e.target.value)}
                    placeholder="My Custom Font"
                  />
                </Field>
                <Field label="Category">
                  <Select value={uCat} onValueChange={setUCat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Font file URL" hint=".woff2 / .woff / .ttf / .otf">
                <Input
                  value={uUrl}
                  onChange={(e) => setUUrl(e.target.value)}
                  placeholder="https://example.com/font.woff2"
                />
              </Field>
              <Field label="Mood tags">
                <Input
                  value={uMood}
                  onChange={(e) => setUMood(e.target.value)}
                  placeholder="clean, modern"
                />
              </Field>
              <Button onClick={submitUrl} disabled={loading} className="w-fit">
                {loading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  "Download"
                )}
              </Button>
            </TabsContent>

            <TabsContent value="upload">
              <div
                role="button"
                tabIndex={0}
                onClick={() => uploadRef.current?.click()}
                className="grid place-items-center gap-2 rounded-[var(--radius-retro)] border-2 border-dashed border-border-soft p-8 text-center cursor-pointer hover:border-border"
              >
                {loading ? (
                  <LoaderCircle className="size-6 animate-spin text-secondary" />
                ) : (
                  <UploadCloud className="size-6 text-secondary" />
                )}
                <p className="text-sm font-medium">
                  Click to upload font files
                </p>
                <p className="text-xs text-fg-muted font-mono">
                  woff2 · woff · ttf · otf
                </p>
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf"
                  multiple
                  hidden
                  onChange={(e) =>
                    e.target.files && submitUpload(e.target.files)
                  }
                />
              </div>
            </TabsContent>
          </Tabs>
          {error ? (
            <p className="mt-1 text-sm text-danger font-medium">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
