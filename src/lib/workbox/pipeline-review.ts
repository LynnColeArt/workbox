import type { DatabaseSync } from "node:sqlite";
import { readPipelineDraft } from "./pipeline-draft";
import { resolveCodeRevision } from "./repo";
import { previewSettingsPipeline } from "./settings-submit";

type LineEnding = "lf" | "crlf" | "cr" | "none";
interface TextLine {
  text: string;
  ending: LineEnding;
}
interface DiffLine extends TextLine {
  kind: "context" | "remove" | "add";
}
interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

const MAX_LINES_PER_SIDE = 2048;
const MAX_COMPARISONS = 400_000;
const MAX_RENDERED_LINES = 1024;
const CONTEXT_LINES = 3;

function splitLines(source: string) {
  const lines: TextLine[] = [];
  let offset = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    if (lines.length >= MAX_LINES_PER_SIDE) return null;
    lines.push({
      text: source.slice(offset, match.index),
      ending: match[0] === "\r\n" ? "crlf" : match[0] === "\n" ? "lf" : "cr",
    });
    offset = match.index + match[0].length;
  }
  if (offset < source.length) {
    if (lines.length >= MAX_LINES_PER_SIDE) return null;
    lines.push({ text: source.slice(offset), ending: "none" });
  }
  return lines;
}

function compareLines(before: TextLine[], after: TextLine[]) {
  // Intern exact line values once so the comparison budget also bounds work for long lines.
  const keys = new Map<string, number>();
  function lineKey({ text, ending }: TextLine) {
    const key = `${ending}:${text}`;
    let id = keys.get(key);
    if (id === undefined) {
      id = keys.size;
      keys.set(key, id);
    }
    return id;
  }
  const beforeKeys = before.map(lineKey);
  const afterKeys = after.map(lineKey);
  const width = after.length + 1;
  const matches = new Uint16Array((before.length + 1) * width);
  for (let old = before.length - 1; old >= 0; old--) {
    for (let next = after.length - 1; next >= 0; next--) {
      const position = old * width + next;
      matches[position] = beforeKeys[old] === afterKeys[next]
        ? 1 + matches[position + width + 1]
        : Math.max(matches[position + width], matches[position + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let old = 0;
  let next = 0;
  while (old < before.length || next < after.length) {
    if (old < before.length && next < after.length && beforeKeys[old] === afterKeys[next]) {
      lines.push({ kind: "context", ...before[old++] });
      next++;
    } else if (old < before.length &&
      (next === after.length || matches[(old + 1) * width + next] >= matches[old * width + next + 1])) {
      lines.push({ kind: "remove", ...before[old++] });
    } else {
      lines.push({ kind: "add", ...after[next++] });
    }
  }
  return lines;
}

function groupHunks(lines: DiffLine[]) {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const [index, line] of lines.entries()) {
    if (line.kind === "context") continue;
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(lines.length, index + CONTEXT_LINES + 1);
    const last = ranges.at(-1);
    if (last && last.end >= start) last.end = end;
    else ranges.push({ start, end });
  }

  const hunks: DiffHunk[] = [];
  let old = 0;
  let next = 0;
  let index = 0;
  let rendered = 0;
  for (const range of ranges) {
    const length = range.end - range.start;
    if (rendered + length > MAX_RENDERED_LINES) return { state: "incomplete", hunks } as const;
    for (; index < range.start; index++) {
      if (lines[index].kind !== "add") old++;
      if (lines[index].kind !== "remove") next++;
    }
    const oldOffset = old;
    const newOffset = next;
    for (; index < range.end; index++) {
      if (lines[index].kind !== "add") old++;
      if (lines[index].kind !== "remove") next++;
    }
    const oldCount = old - oldOffset;
    const newCount = next - newOffset;
    hunks.push({
      oldStart: oldOffset + (oldCount > 0 ? 1 : 0), oldCount,
      newStart: newOffset + (newCount > 0 ? 1 : 0), newCount,
      lines: lines.slice(range.start, range.end),
    });
    rendered += length;
  }
  return { state: "complete", hunks } as const;
}

export function createPipelineDiff(before: string | null, after: string) {
  const text = { before, after };
  const left = splitLines(before ?? "");
  const right = splitLines(after);
  if (!left || !right || left.length * right.length > MAX_COMPARISONS) {
    return { ...text, state: "incomplete", hunks: [] as DiffHunk[] } as const;
  }
  return { ...text, ...groupHunks(compareLines(left, right)) };
}

function failure(code: "invalid_input" | "stale_preview", message: string) {
  return { ok: false, error: { code, message } } as const;
}

export async function reviewPipelineDraft(db: DatabaseSync, projectId: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return failure("invalid_input", "Provide a pipeline draft and its expected revision.");
  }
  const { draft: snapshot, expectedRevision } = input as Record<string, unknown>;
  const draft = readPipelineDraft(db, projectId, snapshot);
  if (!draft.ok) return draft;
  if (expectedRevision !== draft.data.revision) {
    return failure("stale_preview", "Review the current draft revision.");
  }
  if (draft.data.projection !== "valid") {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Resolve the draft diagnostics before reviewing.", diagnostics: draft.data.diagnostics },
    } as const;
  }

  const { name, definition, base, before, revision } = draft.data;
  const preview = await previewSettingsPipeline(db, projectId, { name, definition });
  const project = db.prepare("SELECT repo_path AS repoPath FROM projects WHERE id = ?").get(projectId) as { repoPath: string } | undefined;
  const current = project ? resolveCodeRevision(project.repoPath) : null;
  if (current?.branch !== base.branch || current?.commit !== base.commit) {
    return failure("stale_preview", "Refresh the draft base before reviewing.");
  }
  if (!preview.ok) return preview;
  if (preview.data.base.branch !== base.branch || preview.data.base.commit !== base.commit || preview.data.before !== before) {
    return failure("stale_preview", "Refresh the draft base before reviewing.");
  }

  const { digest, actor, proposalSubmission } = preview.data;
  // Keep the reviewed bytes and retry key together. Submit still requires explicit confirmation.
  const submission = proposalSubmission.available && actor
    ? { name, definition, base, actor, digest, operationId: `settings_${digest}` }
    : null;
  return {
    ok: true,
    data: {
      ...preview.data,
      draftRevision: revision,
      diff: createPipelineDiff(before, definition),
      submission,
    },
  } as const;
}
