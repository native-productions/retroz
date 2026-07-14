"use client";

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

const components: Components = {
  p: ({ children }) => (
    <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-fg">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className="font-mono text-[0.85em]">{children}</code>
      );
    }
    return (
      <code className="rounded-[4px] border border-border-soft bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-fg">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-[var(--radius-retro)] border-2 border-border bg-surface-2 p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 flex list-disc flex-col gap-1 pl-5 marker:text-fg-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 flex list-decimal flex-col gap-1 pl-5 marker:text-fg-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="mb-1.5 mt-3 font-display text-lg font-bold first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 font-display text-base font-bold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2.5 font-display text-sm font-semibold first:mt-0">
      {children}
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 rounded-[var(--radius-retro)] bg-surface-2 px-3 py-2 text-fg-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-t-2 border-border-soft" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-2 border-border bg-surface-2 px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-2 border-border px-2 py-1">{children}</td>
  ),
};

/** Renders assistant log text as GitHub-flavored markdown, retro-styled. */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("text-sm text-fg", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
