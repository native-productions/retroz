"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUp,
  Check,
  Frame,
  ImagePlus,
  LoaderCircle,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import {
  WorkTriggerMenu,
  type MentionAnchor,
} from "@/components/work/work-mention-menu";
import { WorkResearchPicker } from "@/components/work/work-research-picker";
import { ASPECT_RATIOS, findAspectRatio } from "@/lib/aspect-ratios";
import type { ResearchMode } from "@/lib/research";
import type {
  WorkAttachment,
  WorkMention,
  WorkSkillOption,
} from "@/lib/work-types";

const CHIP_CLASS =
  "wk-chip mx-[1px] inline-flex max-w-[15rem] translate-y-[3px] select-none items-center gap-1.5 rounded-[4px] border-2 border-border bg-surface-2 py-[1px] pl-[2px] pr-1.5 font-mono text-[11px] font-semibold leading-[18px] text-fg";
const SKILL_CHIP_CLASS =
  "wk-chip mx-[1px] inline-flex max-w-[15rem] translate-y-[3px] select-none items-center rounded-[4px] border-2 border-border bg-surface-2 py-[1px] pl-1 pr-1.5 font-mono text-[11px] font-semibold leading-[18px] text-fg";
const CHIP_IMG_CLASS =
  "size-[18px] shrink-0 rounded-[2px] border border-border-soft object-cover";

/** Strips the extension so the chip reads `image-2`, not `image-2.png`. */
function shortName(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function buildChip(att: WorkAttachment): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mention = att.name;
  chip.dataset.assetId = att.id;
  chip.dataset.relPath = att.relPath;
  chip.dataset.url = att.url;
  chip.className = CHIP_CLASS;

  const img = document.createElement("img");
  img.src = att.url;
  img.alt = "";
  img.draggable = false;
  img.className = CHIP_IMG_CLASS;

  const label = document.createElement("span");
  label.textContent = shortName(att.name);
  label.className = "truncate";

  chip.append(img, label);
  return chip;
}

/** The `/` keeps its own colour so the chip reads as a command, not a filename. */
function buildSkillChip(skill: WorkSkillOption): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.skill = skill.slug;
  chip.className = SKILL_CHIP_CLASS;

  const slash = document.createElement("span");
  slash.textContent = "/";
  slash.className = "text-accent";

  const label = document.createElement("span");
  label.textContent = skill.slug;
  label.className = "truncate";

  chip.append(slash, label);
  return chip;
}

/** Flattens the editor DOM back into plain text with `@name` tokens. */
function serialize(root: HTMLElement): { text: string; mentions: WorkMention[] } {
  const mentions: WorkMention[] = [];
  let out = "";

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.skill) {
      out += `/${node.dataset.skill}`;
      return;
    }
    if (node.dataset.mention) {
      const name = node.dataset.mention;
      out += `@${name}`;
      if (!mentions.some((m) => m.name === name)) {
        mentions.push({
          name,
          assetId: node.dataset.assetId ?? "",
          relPath: node.dataset.relPath ?? "",
          url: node.dataset.url ?? "",
        });
      }
      return;
    }
    if (node.tagName === "BR") {
      out += "\n";
      return;
    }
    const isBlock = node.tagName === "DIV" || node.tagName === "P";
    if (isBlock && out && !out.endsWith("\n")) out += "\n";
    node.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);
  // contentEditable pads with non-breaking spaces; normalise them back.
  return { text: out.replace(/\u00a0/g, " ").trim(), mentions };
}

/** `@` opens the image picker, `/` opens the skill picker. */
type TriggerKind = "image" | "skill";

interface TriggerQuery {
  kind: TriggerKind;
  node: Text;
  start: number;
  query: string;
}

/** Reads a pending `@query` or `/query` immediately before the caret. */
function readTriggerQuery(root: HTMLElement): TriggerQuery | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;
  if (!root.contains(sel.anchorNode)) return null;
  if (sel.anchorNode.nodeType !== Node.TEXT_NODE) return null;

  const node = sel.anchorNode as Text;
  const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
  // Only at a word boundary, so a URL path or an email never opens the menu.
  const match = /(?:^|\s)([@/])([\p{L}\d._-]*)$/u.exec(before);
  if (!match) return null;

  return {
    kind: match[1] === "/" ? "skill" : "image",
    node,
    start: before.length - match[2].length - 1,
    query: match[2],
  };
}

function caretAnchor(root: HTMLElement): MentionAnchor {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect && (rect.width || rect.height || rect.top)) {
      return { x: rect.left, y: rect.top };
    }
  }
  const box = root.getBoundingClientRect();
  return { x: box.left, y: box.top };
}

export interface WorkComposerHandle {
  /** Drops text at the caret, e.g. from a suggestion chip. */
  insertText: (text: string) => void;
  focus: () => void;
}

export const WorkComposer = React.forwardRef<
  WorkComposerHandle,
  {
    /** Drafts are kept per session, so switching sessions never loses typing. */
    sessionId: string;
    attachments: WorkAttachment[];
    uploading?: boolean;
    onAttach: (files: File[]) => void;
    onRemoveAttachment: (id: string) => void;
    onSearchMentions: (query: string) => Promise<WorkAttachment[]>;
    onSearchSkills: (query: string) => Promise<WorkSkillOption[]>;
    onSubmit: (
      text: string,
      mentions: WorkMention[],
      researchMode: ResearchMode,
    ) => void;
    onStop?: () => void;
    busy?: boolean;
    /** Locked render shape for this session; null lets the agent choose. */
    aspectRatio: string | null;
    onAspectRatioChange: (id: string | null) => void;
    /** Per-message research choice. Hidden when no Tavily key is saved. */
    researchMode: ResearchMode;
    onResearchModeChange: (mode: ResearchMode) => void;
    researchAvailable: boolean;
  }
>(function WorkComposer(
  {
    sessionId,
    attachments,
    uploading = false,
    onAttach,
    onRemoveAttachment,
    onSearchMentions,
    onSearchSkills,
    onSubmit,
    onStop,
    busy = false,
    aspectRatio,
    onAspectRatioChange,
    researchMode,
    onResearchModeChange,
    researchAvailable,
  },
  ref,
) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = React.useState(true);
  const [dropping, setDropping] = React.useState(false);
  const [trigger, setTrigger] = React.useState<{
    kind: TriggerKind;
    query: string;
    anchor: MentionAnchor;
  } | null>(null);
  const [images, setImages] = React.useState<WorkAttachment[]>([]);
  const [skills, setSkills] = React.useState<WorkSkillOption[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);

  /** Last query the highlight was reset for, so it only resets on real change. */
  const lastQueryRef = React.useRef<string | null>(null);

  const optionCount = trigger?.kind === "skill" ? skills.length : images.length;

  // Candidates come from the server: pasted images plus the workflow's asset
  // banks for `@`, the workflow's skills for `/`.
  const kind = trigger?.kind ?? null;
  const query = trigger?.query ?? null;
  React.useEffect(() => {
    if (kind === null || query === null) return;
    let live = true;
    const timer = setTimeout(() => {
      const search = kind === "skill" ? onSearchSkills : onSearchMentions;
      void search(query).then((rows) => {
        if (!live) return;
        if (kind === "skill") setSkills(rows as WorkSkillOption[]);
        else setImages(rows as WorkAttachment[]);
        // A narrower query can return fewer rows than the highlight points at.
        setActiveIndex((i) => (i < rows.length ? i : 0));
      });
    }, 100);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, query, onSearchMentions, onSearchSkills]);

  function syncEmpty() {
    const root = editorRef.current;
    if (!root) return;
    const hasChip = root.querySelector("[data-mention]") !== null;
    setEmpty(!hasChip && (root.textContent ?? "").trim().length === 0);
  }

  // Park the outgoing session's markup and restore the incoming one's. The
  // chips carry their own image URLs, so the raw HTML round-trips fine.
  const draftsRef = React.useRef<Record<string, string>>({});
  const lastSessionRef = React.useRef(sessionId);
  React.useEffect(() => {
    const root = editorRef.current;
    if (!root || lastSessionRef.current === sessionId) return;
    draftsRef.current[lastSessionRef.current] = root.innerHTML;
    root.innerHTML = draftsRef.current[sessionId] ?? "";
    lastSessionRef.current = sessionId;
    setTrigger(null);
    syncEmpty();
  }, [sessionId]);

  function refreshTrigger() {
    const root = editorRef.current;
    if (!root) return;
    const found = readTriggerQuery(root);
    const next = found ? `${found.kind}:${found.query}` : null;
    if (next !== lastQueryRef.current) {
      lastQueryRef.current = next;
      setActiveIndex(0);
    }
    setTrigger(
      found
        ? { kind: found.kind, query: found.query, anchor: caretAnchor(root) }
        : null,
    );
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  /** Puts the caret at the very end of the editor content. */
  function caretToEnd() {
    const root = editorRef.current;
    if (!root) return;
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  React.useImperativeHandle(ref, () => ({
    focus: focusEditor,
    insertText: (text: string) => {
      caretToEnd();
      document.execCommand("insertText", false, text);
      syncEmpty();
    },
  }));

  /** Replaces the pending `@query` / `/query` (or inserts at the caret) with a chip. */
  function insertChip(chip: HTMLSpanElement) {
    const root = editorRef.current;
    if (!root) return;
    root.focus();

    const sel = window.getSelection();
    const pending = readTriggerQuery(root);
    const range = document.createRange();

    if (pending && sel) {
      range.setStart(pending.node, pending.start);
      range.setEnd(pending.node, pending.start + pending.query.length + 1);
      range.deleteContents();
    } else if (sel && sel.rangeCount > 0 && root.contains(sel.anchorNode)) {
      range.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      range.collapse(true);
    } else {
      range.selectNodeContents(root);
      range.collapse(false);
    }

    const trailing = document.createTextNode(" ");
    range.insertNode(trailing);
    range.insertNode(chip);

    const after = document.createRange();
    after.setStart(trailing, 1);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);

    lastQueryRef.current = null;
    setTrigger(null);
    syncEmpty();
  }

  function insertMention(att: WorkAttachment) {
    insertChip(buildChip(att));
  }

  function insertSkill(skill: WorkSkillOption) {
    insertChip(buildSkillChip(skill));
  }

  /** Commits whatever the popover is currently highlighting. */
  function pickActive(): boolean {
    if (!trigger) return false;
    if (trigger.kind === "skill") {
      const skill = skills[activeIndex];
      if (!skill) return false;
      insertSkill(skill);
      return true;
    }
    const image = images[activeIndex];
    if (!image) return false;
    insertMention(image);
    return true;
  }

  function submit() {
    const root = editorRef.current;
    if (!root || busy) return;
    const { text, mentions } = serialize(root);
    if (!text) return;
    root.innerHTML = "";
    draftsRef.current[sessionId] = "";
    setTrigger(null);
    setEmpty(true);
    onSubmit(text, mentions, researchMode);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (trigger) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (optionCount ? (i + 1) % optionCount : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          optionCount ? (i - 1 + optionCount) % optionCount : 0,
        );
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setTrigger(null);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (pickActive()) {
          e.preventDefault();
          return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }

    // Safari selects a `contenteditable=false` chip instead of deleting it;
    // remove it outright so backspace always feels atomic.
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed || sel.anchorOffset !== 0) return;
      const node = sel.anchorNode;
      const prev = node?.previousSibling;
      if (
        prev instanceof HTMLElement &&
        (prev.dataset.mention || prev.dataset.skill)
      ) {
        e.preventDefault();
        prev.remove();
        syncEmpty();
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) {
      e.preventDefault();
      onAttach(files);
      return;
    }
    // Plain text only: pasted markup would drag foreign styles into the editor.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (text) document.execCommand("insertText", false, text);
    syncEmpty();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    setDropping(false);
    if (files.length === 0) return;
    e.preventDefault();
    onAttach(files);
  }

  return (
    <div className="px-6 pb-5 pt-2">
      <div
        className={cn(
          "retro-card relative flex flex-col gap-2 p-2.5 transition-[box-shadow,border-color] duration-150 ease-out focus-within:border-ring",
          dropping && "border-ring",
        )}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropping(false);
        }}
        onDrop={handleDrop}
      >
        {attachments.length > 0 || uploading ? (
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-border-soft pb-2.5">
            {attachments.map((att) => (
              <AttachmentTile
                key={att.id}
                attachment={att}
                onInsert={() => insertMention(att)}
                onRemove={() => {
                  onRemoveAttachment(att.id);
                  focusEditor();
                }}
              />
            ))}
            {uploading ? (
              <span className="flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                <LoaderCircle className="size-3.5 animate-spin" />
                Uploading
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          {empty ? (
            <p
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 px-1 py-1.5 text-sm text-fg-muted/60"
            >
              Describe the post you want. Paste an image and point at it with @,
              or pull in a recipe with /.
            </p>
          ) : null}

          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-label="Message"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onInput={() => {
              syncEmpty();
              refreshTrigger();
            }}
            onKeyUp={refreshTrigger}
            onMouseUp={refreshTrigger}
            onBlur={() => setTrigger(null)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="max-h-[38vh] min-h-[3.25rem] w-full overflow-y-auto whitespace-pre-wrap break-words px-1 py-1.5 text-sm leading-6 outline-none"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid size-8 place-items-center rounded-[var(--radius-retro)] border-2 border-transparent text-fg-muted outline-none transition-colors hover:border-border hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
              title="Add image"
              aria-label="Add image"
            >
              <ImagePlus className="size-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onAttach(files);
                e.target.value = "";
              }}
            />
            <AspectRatioPicker
              value={aspectRatio}
              onChange={onAspectRatioChange}
            />
            {researchAvailable ? (
              <WorkResearchPicker
                value={researchMode}
                onChange={onResearchModeChange}
              />
            ) : null}
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted/70 lg:block">
              ⌘V image · @ image · / skill · ⏎ send
            </p>
          </div>

          {busy && onStop ? (
            <Button size="sm" variant="outline" onClick={onStop}>
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={empty}
              onClick={submit}
              aria-label="Send message"
            >
              Send
              <ArrowUp className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {trigger ? (
        <WorkTriggerMenu
          kind={trigger.kind}
          images={images}
          skills={skills}
          query={trigger.query}
          activeIndex={activeIndex}
          anchor={trigger.anchor}
          onPickImage={insertMention}
          onPickSkill={insertSkill}
          onHoverIndex={setActiveIndex}
        />
      ) : null}
    </div>
  );
});

/**
 * Locks every render in this session to one shape. It lives in the composer
 * rather than the session header because it is part of framing the request, and
 * because a carousel is only usable when its slides agree — the bundle editor
 * flags the mismatch afterwards, this prevents it up front.
 */
function AspectRatioPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const active = findAspectRatio(value);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Render shape"
          aria-label={`Render shape: ${active ? active.label : "auto"}`}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-[var(--radius-retro)] border-2 px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
            active
              ? "border-border bg-surface-2 text-fg"
              : "border-transparent text-fg-muted hover:border-border hover:bg-surface-2 hover:text-fg",
            "data-[state=open]:border-border data-[state=open]:bg-surface-2",
          )}
        >
          <Frame className="size-4 shrink-0" />
          <span className="font-mono text-[11px] font-semibold">
            {active ? active.label : "Auto"}
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={8}
          className="retro-card z-50 min-w-[13rem] p-1 shadow-hard-lg"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted/70">
            Render shape
          </DropdownMenu.Label>

          <RatioRow
            label="Auto"
            hint="Agent picks per image"
            selected={!active}
            onSelect={() => onChange(null)}
          />
          <DropdownMenu.Separator className="my-1 h-0.5 bg-border-soft" />
          {ASPECT_RATIOS.map((ratio) => (
            <RatioRow
              key={ratio.id}
              label={ratio.label}
              hint={`${ratio.hint} · ${ratio.width}×${ratio.height}`}
              selected={active?.id === ratio.id}
              onSelect={() => onChange(ratio.id)}
            />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RatioRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-[4px] px-2 py-1.5 outline-none data-[highlighted]:bg-secondary data-[highlighted]:text-secondary-fg",
        selected ? "text-fg" : "text-fg-muted",
      )}
    >
      <span
        className={cn(
          "w-11 shrink-0 font-mono text-xs",
          selected && "font-semibold",
        )}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] opacity-70">
        {hint}
      </span>
      {selected ? (
        <Check className="size-3.5 shrink-0" strokeWidth={3} />
      ) : null}
    </DropdownMenu.Item>
  );
}

function AttachmentTile({
  attachment,
  onInsert,
  onRemove,
}: {
  attachment: WorkAttachment;
  onInsert: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="wk-chip group relative flex items-center gap-2 rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 py-1 pl-1 pr-2">
      <button
        type="button"
        onClick={onInsert}
        title={`Mention ${attachment.name}`}
        className="flex items-center gap-2 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt=""
          draggable={false}
          className="size-8 rounded-[3px] border border-border-soft object-cover"
        />
        <span className="font-mono text-[11px] font-semibold">
          {attachment.name}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="grid size-4 place-items-center rounded-full text-fg-muted outline-none transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-ring active:scale-90"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
