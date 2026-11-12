"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

const formats = [
  { id: "heading", label: "Heading" },
  { id: "bold", label: "Bold", shortcut: "Control+B Meta+B" },
  { id: "italic", label: "Italic", shortcut: "Control+I Meta+I" },
  { id: "link", label: "Link", shortcut: "Control+K Meta+K" },
  { id: "list", label: "Bulleted list" },
  { id: "numbered", label: "Numbered list" },
  { id: "quote", label: "Quote" },
  { id: "code", label: "Code block" },
] as const;

type Format = (typeof formats)[number]["id"];

function normalized(source: string) {
  return source.replace(/\r\n?/g, "\n");
}

function sourceOffset(source: string, offset: number) {
  let index = 0;
  for (let position = 0; position < offset && index < source.length; position++) {
    index += source[index] === "\r" && source[index + 1] === "\n" ? 2 : 1;
  }
  return index;
}

// Textareas expose LF line endings. Preserve original line endings outside the edit.
export function updateMarkdownSource(source: string, next: string): string {
  const previous = normalized(source);
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let beforeEnd = previous.length;
  let afterEnd = next.length;
  while (beforeEnd > start && afterEnd > start && previous[beforeEnd - 1] === next[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  return source.slice(0, sourceOffset(source, start)) + next.slice(start, afterEnd)
    + source.slice(sourceOffset(source, beforeEnd));
}

export function formatMarkdown(source: string, start: number, end: number, format: Format) {
  const visible = normalized(source);
  const replace = (from: number, to: number, text: string, selectFrom: number, selectTo: number) => ({
    source: source.slice(0, sourceOffset(source, from)) + text + source.slice(sourceOffset(source, to)),
    start: from + selectFrom,
    end: from + selectTo,
  });
  const selected = source.slice(sourceOffset(source, start), sourceOffset(source, end));
  if (format === "bold" || format === "italic") {
    const marker = format === "bold" ? "**" : "*";
    const text = selected || "text";
    return replace(start, end, marker + text + marker, marker.length, marker.length + normalized(text).length);
  }
  if (format === "link") {
    const text = selected || "link text";
    const target = "https://example.com";
    const offset = normalized(text).length + 3;
    return replace(start, end, `[${text}](${target})`, offset, offset + target.length);
  }

  const lineStart = start === 0 ? 0 : visible.lastIndexOf("\n", start - 1) + 1;
  const selectionEndsAtLineStart = end > start && visible[end - 1] === "\n";
  const lineEnd = selectionEndsAtLineStart ? end - 1 : visible.indexOf("\n", end);
  const to = lineEnd === -1 ? visible.length : lineEnd;
  const block = source.slice(sourceOffset(source, lineStart), sourceOffset(source, to));
  if (format === "code") {
    const text = block || "code";
    let longest = 0;
    for (const [run] of text.matchAll(/`+/g)) longest = Math.max(longest, run.length);
    const fence = "`".repeat(Math.max(3, longest + 1));
    return replace(lineStart, to, `${fence}\n${text}\n${fence}`, fence.length + 1, fence.length + 1 + normalized(text).length);
  }

  const prefix = (index: number) => {
    if (format === "heading") return "## ";
    if (format === "numbered") return `${index + 1}. `;
    return format === "list" ? "- " : "> ";
  };
  const text = (block || "text").split(/(\r\n|\n|\r)/).map((line, index) =>
    index % 2 ? line : prefix(index / 2) + line
  ).join("");
  return replace(lineStart, to, text, prefix(0).length, normalized(text).length);
}

const markdownStyles = "min-w-0 break-words text-sm leading-relaxed "
  + "[&_p]:my-2 [&_a]:text-[var(--wb-link)] [&_a]:underline "
  + "[&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold "
  + "[&_h3]:my-2 [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold "
  + "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 "
  + "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--wb-border)] [&_blockquote]:pl-3 "
  + "[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-[var(--wb-bg)] [&_pre]:p-3 "
  + "[&_code]:rounded [&_code]:bg-[var(--wb-bg)] [&_code]:px-1 [&_pre_code]:px-0 "
  + "[&_table]:block [&_table]:overflow-auto [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2";

export function MarkdownContent({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`${markdownStyles} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

type MarkdownEditorProps = {
  value: string;
  onChange: (source: string) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
};

type Preview = { source: string } & (
  | { status: "ready"; html: string }
  | { status: "error"; message: string }
);

export function MarkdownEditor({ value, onChange, label, disabled, required, name }: MarkdownEditorProps) {
  const editorId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<{ start: number; end: number } | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<Preview | null>(null);
  const currentPreview = preview?.source === value ? preview : null;
  const previewId = `${editorId}-preview`;
  const sourceId = `${editorId}-source`;

  useEffect(() => {
    if (mode !== "preview") return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: value }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok && result.ok && result.data.source === value && typeof result.data.html === "string") {
          setPreview({ source: value, status: "ready", html: result.data.html });
        } else {
          setPreview({ source: value, status: "error", message: result.error?.message ?? "Could not load the preview." });
        }
      } catch {
        if (!controller.signal.aborted) {
          setPreview({ source: value, status: "error", message: "Could not load the preview." });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [mode, value]);

  useLayoutEffect(() => {
    if (mode !== "write" || !selection.current || !textarea.current) return;
    const { start, end } = selection.current;
    selection.current = null;
    textarea.current.focus();
    textarea.current.setSelectionRange(start, end);
  }, [mode, value]);

  function apply(format: Format) {
    const field = textarea.current;
    if (!field || disabled) return;
    const edit = formatMarkdown(value, field.selectionStart, field.selectionEnd, format);
    selection.current = { start: edit.start, end: edit.end };
    onChange(edit.source);
  }

  function onShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    const format = key === "b" ? "bold" : key === "i" ? "italic" : key === "k" ? "link" : null;
    if (!format) return;
    event.preventDefault();
    apply(format);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={editorId} className="block text-sm font-medium">{label}</label>
      <div role="group" aria-label={`${label} view`} className="flex gap-2">
        <button type="button" className="wb-btn aria-pressed:border-[var(--wb-accent)]" aria-pressed={mode === "write"} aria-controls={sourceId} onClick={() => setMode("write")}>Write</button>
        <button type="button" className="wb-btn aria-pressed:border-[var(--wb-accent)]" aria-pressed={mode === "preview"} aria-controls={previewId} onClick={() => setMode("preview")}>Preview</button>
      </div>
      <div id={sourceId} hidden={mode !== "write"} className="space-y-2">
        <div role="group" aria-label="Markdown formatting" className="flex flex-wrap gap-1">
          {formats.map((format) => (
            <button
              key={format.id}
              type="button"
              className="wb-btn"
              disabled={disabled}
              aria-keyshortcuts={"shortcut" in format ? format.shortcut : undefined}
              onClick={() => apply(format.id)}
            >{format.label}</button>
          ))}
        </div>
        <textarea
          id={editorId}
          name={name}
          ref={textarea}
          rows={6}
          disabled={disabled}
          required={required}
          value={value}
          onChange={(event) => onChange(updateMarkdownSource(value, event.currentTarget.value))}
          onKeyDown={onShortcut}
          onInvalid={(event) => {
            if (mode === "preview") {
              selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
              setMode("write");
            }
          }}
          className="w-full rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] px-3 py-2 text-sm"
        />
      </div>
      <div id={previewId} hidden={mode !== "preview"} className="wb-panel min-h-20 px-3 py-2" aria-label={`${label} preview`}>
        {!currentPreview && <p role="status" className="wb-muted text-sm">Loading preview…</p>}
        {currentPreview?.status === "error" && <p role="alert" className="text-sm">{currentPreview.message}</p>}
        {currentPreview?.status === "ready" && (currentPreview.html
          ? <MarkdownContent html={currentPreview.html} />
          : <p className="wb-muted text-sm">Nothing to preview.</p>)}
      </div>
    </div>
  );
}
