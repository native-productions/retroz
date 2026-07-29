"use client";

import * as React from "react";
import { ArrowUp, ImagePlus, LoaderCircle, Square, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/ui-button";
import {
  WorkMentionMenu,
  type MentionAnchor,
} from "@/components/work/work-mention-menu";
import type { WorkAttachment, WorkMention } from "@/lib/work-types";

const CHIP_CLASS =
  "wk-chip mx-[1px] inline-flex max-w-[15rem] translate-y-[3px] select-none items-center gap-1.5 rounded-[4px] border-2 border-border bg-surface-2 py-[1px] pl-[2px] pr-1.5 font-mono text-[11px] font-semibold leading-[18px] text-fg";
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

interface MentionQuery {
  node: Text;
  start: number;
  query: string;
}

/** Reads a pending `@query` immediately before the caret, if there is one. */
function readMentionQuery(root: HTMLElement): MentionQuery | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;
  if (!root.contains(sel.anchorNode)) return null;
  if (sel.anchorNode.nodeType !== Node.TEXT_NODE) return null;

  const node = sel.anchorNode as Text;
  const before = (node.textContent ?? "").slice(0, sel.anchorOffset);
  const match = /(?:^|\s)@([\p{L}\d._-]*)$/u.exec(before);
  if (!match) return null;

  return {
    node,
    start: before.length - match[1].length - 1,
    query: match[1],
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
    onSubmit: (text: string, mentions: WorkMention[]) => void;
    onStop?: () => void;
    busy?: boolean;
  }
>(function WorkComposer(
  {
    sessionId,
    attachments,
    uploading = false,
    onAttach,
    onRemoveAttachment,
    onSearchMentions,
    onSubmit,
    onStop,
    busy = false,
  },
  ref,
) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [empty, setEmpty] = React.useState(true);
  const [dropping, setDropping] = React.useState(false);
  const [mention, setMention] = React.useState<{
    query: string;
    anchor: MentionAnchor;
  } | null>(null);
  const [matches, setMatches] = React.useState<WorkAttachment[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);

  /** Last query the highlight was reset for, so it only resets on real change. */
  const lastQueryRef = React.useRef<string | null>(null);

  // Mention candidates come from the server: this session's uploads plus the
  // workflow's asset banks, ranked against what has been typed so far.
  const query = mention?.query ?? null;
  React.useEffect(() => {
    if (query === null) return;
    let live = true;
    const timer = setTimeout(() => {
      void onSearchMentions(query).then((rows) => {
        if (live) setMatches(rows);
      });
    }, 100);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, onSearchMentions]);

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
    setMention(null);
    syncEmpty();
  }, [sessionId]);

  function refreshMention() {
    const root = editorRef.current;
    if (!root) return;
    const found = readMentionQuery(root);
    const next = found ? found.query : null;
    if (next !== lastQueryRef.current) {
      lastQueryRef.current = next;
      setActiveIndex(0);
    }
    setMention(found ? { query: found.query, anchor: caretAnchor(root) } : null);
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

  /** Replaces the pending `@query` (or inserts at the caret) with a chip. */
  function insertMention(att: WorkAttachment) {
    const root = editorRef.current;
    if (!root) return;
    root.focus();

    const sel = window.getSelection();
    const pending = readMentionQuery(root);
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

    const chip = buildChip(att);
    const trailing = document.createTextNode(" ");
    range.insertNode(trailing);
    range.insertNode(chip);

    const after = document.createRange();
    after.setStart(trailing, 1);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);

    lastQueryRef.current = null;
    setMention(null);
    syncEmpty();
  }

  function submit() {
    const root = editorRef.current;
    if (!root || busy) return;
    const { text, mentions } = serialize(root);
    if (!text) return;
    root.innerHTML = "";
    draftsRef.current[sessionId] = "";
    setMention(null);
    setEmpty(true);
    onSubmit(text, mentions);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (matches.length ? (i + 1) % matches.length : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          matches.length ? (i - 1 + matches.length) % matches.length : 0,
        );
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && matches[activeIndex]) {
        e.preventDefault();
        insertMention(matches[activeIndex]);
        return;
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
      if (prev instanceof HTMLElement && prev.dataset.mention) {
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
              Describe the post you want. Paste an image, then mention it with @.
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
              refreshMention();
            }}
            onKeyUp={refreshMention}
            onMouseUp={refreshMention}
            onBlur={() => setMention(null)}
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
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted/70 sm:block">
              ⌘V image · @ mention · ⏎ send
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

      {mention ? (
        <WorkMentionMenu
          items={matches}
          activeIndex={activeIndex}
          anchor={mention.anchor}
          onPick={insertMention}
          onHoverIndex={setActiveIndex}
        />
      ) : null}
    </div>
  );
});

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
