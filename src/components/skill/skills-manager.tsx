"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Sparkles, RefreshCw, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/ui-button";
import { Card } from "@/components/ui/ui-card";
import { Badge } from "@/components/ui/ui-badge";
import { EmptyState } from "@/components/page-header";
import { useConfirm } from "@/components/confirm-provider";
import {
  SkillEditorDialog,
  type SkillFormValue,
} from "@/components/skill/skill-editor-dialog";
import { deleteSkill, syncSkillsFromDisk } from "@/lib/actions/skill-actions";

interface SkillItem extends SkillFormValue {
  id: string;
  slug: string;
}

export function SkillsManager({ skills }: { skills: SkillItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SkillFormValue | undefined>();
  const [syncing, setSyncing] = React.useState(false);

  async function sync() {
    setSyncing(true);
    try {
      await syncSkillsFromDisk();
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  function openNew() {
    setEditing(undefined);
    setOpen(true);
  }
  function openEdit(s: SkillItem) {
    setEditing(s);
    setOpen(true);
  }
  async function remove(s: SkillItem) {
    const ok = await confirm({
      title: "Delete skill?",
      description: `“${s.name}” and its SKILL.md file will be removed.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await deleteSkill(s.id);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={sync} disabled={syncing}>
          {syncing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Sync from disk
        </Button>
        <Button onClick={openNew}>
          <Plus className="size-4" /> New skill
        </Button>
      </div>

      {skills.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="No skills yet"
          description="Skills teach Claude reusable content recipes — carousel layouts, caption styles, brand rules."
          action={
            <Button variant="secondary" onClick={openNew}>
              Create your first skill
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {skills.map((s) => (
            <Card key={s.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display font-semibold truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-fg-muted font-mono">/{s.slug}</p>
                </div>
                <Badge tone={s.enabled ? "primary" : "muted"}>
                  {s.enabled ? "on" : "off"}
                </Badge>
              </div>
              <p className="text-sm text-fg-muted line-clamp-2 min-h-10">
                {s.description || "No description."}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SkillEditorDialog open={open} onOpenChange={setOpen} skill={editing} />
    </div>
  );
}
