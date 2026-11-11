# UI Finishing Brief — Workbox

You are finishing the UI of Workbox, a Next.js (App Router, TS, Tailwind v4,
zero runtime deps beyond zod/tsx) GitHub-shaped portal over hubnot
repositories. The substrate (hubnot, a Go CLI named `hn`) is DONE and OFF
LIMITS: never modify anything outside `~/projects/workbox`.

## The single most important rule

**Follow the GitHub UI spec.** This is deliberately a GitHub-look portal;
the spec's structure wins over invention wherever a GitHub analog exists.
Do NOT invent new top-level tabs, new page shapes, or new locations for
standard elements. Where hubnot has no GitHub analog (Memory, CI trust,
Insights), keep the existing structure: tabs under the project header.

## Project layout (as it stands)

- Server components under `src/app/`; page → project shell via
  `src/app/p/[id]/layout.tsx` (tab bar: Code, Issues, Proposals, Memory,
  CI, Discussions, Insights — do not add or remove tabs).
- `/p/[id]` redirects to Code (Code-first IA, intended).
- Components under `src/components/` (client components: create-form,
  review-buttons, branch-selector, description-editor, new-project-form).
- Lib layer: `src/lib/hn/` (port to hubnot: runner, gitread, verifier) and
  `src/lib/workbox/` (db via node:sqlite, queries, repo, ci, index, discover).
- All reads flow from the SQLite projection or git plumbing. Do not invent
  new data sources.

## Theme/design tokens (globals.css) — keep

Dark GitHub-like: `--wb-*` CSS vars (bg #0d1117, panel #161b22, border
#30363d, accent #3fb950 hubnot green, link #4493f8, open green, closed
purple, warn yellow). Utility classes: wb-panel, wb-chip, wb-btn, wb-link,
wb-muted, wb-mono. Use these; do not introduce other visual languages.

## Your tasks (in order; commits after each verified milestone)

1. **Code page polish (src/app/p/[id]/code/page.tsx).** GitHub repo-home
   fidelity: header with branch pulldown (exists), path breadcrumbs
   (exists), commit banner (exists). Tighten: latest-commit-per-file rows
   should be gray-text like GitHub's; message column truncates with ellipsis;
   add the file/dir icons ( ▸/· today — use inline SVG or unicode, keep
   zero-dep); "about" numbers formatting. No structural changes.
2. **Issue page (p/[id]/issue/[issueId]/page.tsx).** GitHub issue fidelity:
   comment avatars (initial letter circles are fine, zero-dep), comment
   header layout (author, time, ✓ signed badge right-aligned), body
   typography. The signed-event-chain section at the bottom is OUR hubnot
   differentiation — keep, polish alignment only.
3. **Issues tab (p/[id]/issues/page.tsx).** GitHub issue-list fidelity:
   open/closed counts header like GitHub's ("N Open / M Closed" tabs look,
   even if non-functional), lighter row metas, number styling (#N muted).
   Keep the New issue form.
4. **Proposals tab.** Same list-fidelity treatment as issues. Keep
   ReviewButtons and CreateForm exactly as they are functionally; polish
   layout only. The lineage timeline stays (hubnot is lineage-based — that
   is correct differentiation, do not remove).
5. **CI tab.** Pipeline cards like GitHub Actions workflow cards; the
   New pipeline form stays. Polish only.
6. **Memory tab.** Stream grouping (green stream header rows), record
   cards. Keep the inert-data warning chip — it is doctrine, not chrome.

## Hard constraints

- Zero new npm dependencies. No icon libs, no UI kits. Inline SVG/unicode only.
- node:sqlite + node:crypto are available; nothing database-related changes.
- Do not touch `src/lib/` except typing/import fixes.
- Do not touch workbox-demo or any `~/projects/*` repo other than workbox.
- Every `hn` CLI touch stays in src/lib/hn/ (laws documented in README.md —
  read it; flags-before-positionals etc. are load-bearing).
- Next 16 laws (violating these breaks the build): `cacheComponents` is on —
  no `export const runtime`; dynamic pages use `await connection()` +
  `export const instant = false`; fs calls in discover.ts already carry
  `/*turbopackIgnore: true*/` comments (keep them); colon route params arrive
  URL-encoded in `[issueId]` (normalizeIssueId handles it — keep).
- `npx tsc --noEmit` must stay clean and `npm run build` must pass before
  each commit. If the dev server is running on port 4123, leave it alone.

## Verification beats per task

- tsc clean
- npm run build passes
- git commit with a descriptive message

Work steadily top to bottom; do not redesign; finish surfaces. If you find
a genuine bug in lib code, note it in your final summary instead of fixing
lib code yourself.
