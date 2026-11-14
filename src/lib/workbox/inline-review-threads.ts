import { patchLines } from "./patch-lines";

export type InlineReview = {
  id: string;
  kind: string;
  author: string;
  actor?: string;
  body: string;
  date?: string;
  path?: string;
  side?: string;
  original_commit?: string;
  original_line?: number;
  diff_hunk?: string;
  reply_to?: string;
};

export function inlineReviewThreads(reviews: InlineReview[], head: string, file?: string, patch?: string, nativeAnchor = false) {
  const comments = reviews.filter(review => review.kind === "inline_comment");
  const byId = new Map(comments.map(comment => [comment.id, comment]));
  const groups = new Map<string, InlineReview[]>();
  for (const comment of comments) {
    let root = comment;
    const visited = new Set([root.id]);
    while (root.reply_to && !visited.has(root.reply_to)) {
      const parent = byId.get(root.reply_to);
      if (!parent) break;
      root = parent;
      visited.add(root.id);
    }
    const group = groups.get(root.id) ?? [];
    group.push(comment);
    groups.set(root.id, group);
  }
  const rows = patch ? patchLines(patch) : [];
  return [...groups.entries()].map(([id, comments]) => {
    const root = byId.get(id)!;
    const anchor = { path: root.path ?? null, revision: root.original_commit ?? null,
      side: root.side ?? null, line: root.original_line ?? null };
    const originalRows = root.diff_hunk ? patchLines(root.diff_hunk) : [];
    const position = (row: ReturnType<typeof patchLines>[number]) =>
      anchor.side === "LEFT" ? row.oldLine : anchor.side === "RIGHT" ? row.newLine : null;
    const originalIndex = originalRows.findIndex(row => anchor.line !== null && position(row) === anchor.line);
    const original = originalRows[originalIndex];
    const rowIndex = head && anchor.revision === head && anchor.path && anchor.path === file && !root.reply_to
      ? rows.findIndex(row => anchor.line !== null && position(row) === anchor.line &&
        (nativeAnchor || (anchor.side === "RIGHT" ? (!original || original.line === row.line) :
          !!root.diff_hunk && !!patch?.includes(root.diff_hunk) && original?.line === row.line)))
      : -1;
    return { id, anchor, originalHunk: root.diff_hunk ?? null, comments: [root, ...comments.filter(comment => comment.id !== id)],
      originalRowIndex: originalIndex < 0 ? null : originalIndex, rowIndex: rowIndex < 0 ? null : rowIndex };
  });
}

export type InlineReviewThread = ReturnType<typeof inlineReviewThreads>[number];
