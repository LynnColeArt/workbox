"use client";

import dynamic from "next/dynamic";
import { requiresSourceReview } from "@/lib/workbox/markdown-draft";
import { supportsVisualMarkdown } from "@/lib/workbox/markdown-visual-safety";

const VisualEditor = dynamic(() => import("./markdown-visual-editor"), {
  ssr: false,
  loading: () => <p role="status">Loading visual editor…</p>,
});

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
  const [mode, setMode] = useState<"visual" | "source" | "preview">("visual");
  const [session, setSession] = useState(() => ({ source: value, accepted: value, generation: 0 }));
  const [failed, setFailed] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const baseline = useRef<string | undefined>(undefined);
  const editor = useRef<HTMLDivElement>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const [submissionBlocked, setSubmissionBlocked] = useState(false);
  if (session.accepted !== value) {
    setSession({ source: value, accepted: value, generation: session.generation + 1 });
    setCandidate(null);
    setFailed(false);
  }
  const visualUnavailable = failed || !supportsVisualMarkdown(session.source);
  const activeMode = mode === "visual" && visualUnavailable ? "source" : mode;
  const shownSource = candidate ?? value;

  useEffect(() => {
    const form = editor.current?.closest("form");
    if (!form) return;
    const guard = (event: Event) => {
      if (candidate === null && (!required || value.trim() || disabled)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setSubmissionBlocked(true);
      setMode("source");
      sourceButton.current?.focus();
    };
    form.addEventListener("submit", guard, true);
    return () => form.removeEventListener("submit", guard, true);
  }, [candidate, disabled, required, value]);

  function changeMode(next: typeof mode) {
    if (next === "visual" && activeMode !== "visual") {
      baseline.current = undefined;
      setSession({ source: shownSource, accepted: value, generation: session.generation + 1 });
      setFailed(false);
    }
    setMode(next);
  }

  function acceptSource(source: string) {
    setCandidate(null);
    setSubmissionBlocked(false);
    setSession(previous => ({ ...previous, accepted: source }));
    onChange(source);
  }

  function visualChange(source: string, initializing: boolean) {
    if (initializing) {
      baseline.current = source;
      return;
    }
    if (!supportsVisualMarkdown(source)) {
      setCandidate(source);
      setFailed(true);
      return;
    }
    if (disabled) return;
    if (candidate !== null || requiresSourceReview(session.source, baseline.current)) {
      setCandidate(source);
    } else acceptSource(source);
  }
  const [preview, setPreview] = useState<Preview | null>(null);
  const currentPreview = preview?.source === shownSource ? preview : null;
  const previewId = `${editorId}-preview`;
  const sourceId = `${editorId}-source`;

  useEffect(() => {
    if (activeMode !== "preview") return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/markdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: shownSource }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok && result.ok && result.data.source === shownSource && typeof result.data.html === "string") {
          setPreview({ source: shownSource, status: "ready", html: result.data.html });
        } else {
          setPreview({ source: shownSource, status: "error", message: result.error?.message ?? "Could not load the preview." });
        }
      } catch {
        if (!controller.signal.aborted) {
          setPreview({ source: shownSource, status: "error", message: "Could not load the preview." });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [activeMode, shownSource]);

  useLayoutEffect(() => {
    if (activeMode !== "source" || !selection.current || !textarea.current) return;
    const { start, end } = selection.current;
    selection.current = null;
    textarea.current.focus();
    textarea.current.setSelectionRange(start, end);
  }, [activeMode, shownSource]);

  function apply(format: Format) {
    const field = textarea.current;
    if (!field || disabled) return;
    const edit = formatMarkdown(shownSource, field.selectionStart, field.selectionEnd, format);
    selection.current = { start: edit.start, end: edit.end };
    if (candidate !== null) setCandidate(edit.source);
    else acceptSource(edit.source);
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
    <div ref={editor} className="space-y-2">
      <label htmlFor={editorId} className="block text-sm font-medium">{label}</label>
      <div role="group" aria-label={`${label} view`} className="flex gap-2">
        <button type="button" className="wb-btn" aria-pressed={activeMode === "visual"} onClick={() => changeMode("visual")}>Visual</button>
        <button ref={sourceButton} type="button" className="wb-btn" aria-pressed={activeMode === "source"} aria-controls={sourceId} onClick={() => changeMode("source")}>Source</button>
        <button type="button" className="wb-btn" aria-pressed={activeMode === "preview"} aria-controls={previewId} onClick={() => changeMode("preview")}>Preview</button>
      </div>
      {activeMode === "visual" && <VisualEditor key={session.generation} source={session.source} label={label}
        disabled={disabled} onChange={visualChange} onError={() => setFailed(true)} />}
      {activeMode === "source" && mode === "visual" && <p role="status">Visual can’t represent this Markdown. You can edit the source directly.</p>}
      {candidate !== null && <div className="space-y-2">
        <p role="status">Visual editing may have reformatted the Markdown. Review the source before using these changes.</p>
        {activeMode === "source" ? <button type="button" disabled={disabled} className="wb-btn" onClick={() => acceptSource(candidate)}>Use this Markdown</button>
          : <button type="button" className="wb-btn" onClick={() => changeMode("source")}>Review source</button>}
        <button type="button" className="wb-btn ml-2" onClick={() => {
          setCandidate(null);
          setSession({ source: value, accepted: value, generation: session.generation + 1 });
          setFailed(false);
        }}>Discard visual changes</button>
      </div>}
      {submissionBlocked && candidate === null && required && !value.trim() && <p role="alert">Enter {label.toLowerCase()}.</p>}
      <div id={sourceId} hidden={activeMode !== "source"} className="space-y-2">
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
          aria-required={required}
          value={shownSource}
          onChange={(event) => {
            const updated = updateMarkdownSource(shownSource, event.currentTarget.value);
            if (candidate !== null) setCandidate(updated);
            else acceptSource(updated);
          }}
          onKeyDown={onShortcut}
          className="w-full rounded border border-[var(--wb-border)] bg-[var(--wb-bg)] px-3 py-2 text-sm"
        />
      </div>
      <div id={previewId} hidden={activeMode !== "preview"} className="wb-panel min-h-20 px-3 py-2" aria-label={`${label} preview`}>
        {!currentPreview && <p role="status" className="wb-muted text-sm">Loading preview…</p>}
        {currentPreview?.status === "error" && <p role="alert" className="text-sm">{currentPreview.message}</p>}
        {currentPreview?.status === "ready" && (currentPreview.html
          ? <MarkdownContent html={currentPreview.html} />
          : <p className="wb-muted text-sm">Nothing to preview.</p>)}
      </div>
    </div>
  );
}
