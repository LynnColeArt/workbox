# Implementation Plan — Proposal detail and next actions

- **Planning and merge target** `feat/proposal-detail`
- **Date** 2026-11-11
- **Spec** [Proposal detail and next actions](spec.md)

## Summary

Replace the Proposals tab's event-shaped rows with lineage entries and add an exact-candidate detail route. Read candidate readiness and visibility from Hubnot. Keep **Conversation**, **Checks**, and **Files changed** under the proposal detail header. Pin every view, evidence item, and review submission to the candidate it belongs to.

```text
Proposals list → visible lineage entry → exact candidate link
                                              │
                           Hubnot status ─────┼─ revision, policy, blockers, next steps
                           Visible events ────┼─ signed Conversation
                           Exact Git commits ─┘  Files changed
```

## Technical Context

**Language/Version**: TypeScript 5, Node 26 and Next.js 16.4.6 App Router.

**Primary Dependencies**: Existing React, Tailwind, Zod, SQLite projection, Git adapter, and `runHn` adapter. Hubnot `native.proposal-read` and `native.event-read` version 1. Zero new npm dependencies.

**Storage**: Existing project and verified event rows supply local discovery hints. Hubnot supplies selected-history authorization and evaluation. No schema migration, cache of authorization decisions, or new persisted state.

**Testing**: Fixture-backed TypeScript tests, real disposable Hubnot/Git integration, route acceptance and review refresh. Run scoped ESLint, `npx tsc --noEmit`, and `npm run build`.

**Target Platform**: Existing Workbox web runtime on a local project checkout. Focused browser checks for this change. Full platform release qualification is outside this mission.

**Project Type**: Existing Next.js app and server-side read adapters. Reuse the browser review endpoint and form.

**Performance Goals**: Page and bound native lookups. Evaluate status for the selected candidate and only when needed for lineage selection. Load Git comparison only for Files changed. Apply subprocess timeouts and output limits, and keep project reads request-local.

**Constraints**: Keep current project navigation and theme. Hubnot remains the evaluator and writer. No new run, revision, acceptance, merge, or publish mutations, and no MCP or Hubnot changes.

## Charter Check

No Workbox charter was present. The plan uses the repository instructions and proposal-detail spec. Status and visibility stay in Hubnot, local Git reads use exact objects, and write scope is limited to the existing review action. Phase 1 review found no spec change needed.

## Project Structure

| Surface | Proposed work |
|---|---|
| `src/lib/hn/proposal-read.ts` | Add a server-side typed adapter using `runHn`. Validate capability, envelope, full IDs, schema, exact subject, and selected-history scope. Normalize failures into controlled results. |
| `src/lib/workbox/proposal-detail.ts` | Resolve project, visible lineage and candidate, candidate evidence, and next-step view data. Query only relevant local projection rows as discovery hints. |
| `src/lib/workbox/proposal-comparison.ts` | Read the changed-file list and selected file patch using exact, verified Git objects and read-only plumbing. |
| `src/app/p/[id]/proposals/page.tsx` | Link one row per visible lineage to detail. Retain New proposal. Remove local readiness inference and evidence rows masquerading as proposals. |
| `src/app/p/[id]/proposals/[candidateId]/page.tsx` | Render the header, revision picker, status and actions, and three detail views. Exact links pin the candidate. |
| `src/components/review-buttons.tsx` and existing project review route | Pass the exact candidate and retain review behavior. Improve visible refusal and refresh without switching revisions. |
| `tests/` | Add fixture-backed adapter, lineage, policy, comparison, and browser/route coverage. |

## Implementation Concern Map

| Concern | Design and dependencies | Verification |
|---|---|---|
| IC-01 — Native status and visibility | Build the read adapter first. Use `hn capabilities --json`, `hn proposal status FULL_ID --json`, `hn event show FULL_ID --json`, and optional `hn identity show --json`. Model available and unavailable independently for candidate identity, evaluation, and actor. | FR-002, FR-004, FR-006, C-001. Test malformed, unavailable, older binary, wrong candidate, and hidden evidence. |
| IC-02 — Lineage and exact navigation | After IC-01, use indexed verified `proposal.open` and `proposal.revise` IDs for bounded discovery and validate visible candidates through Hubnot before displaying them. Group by verified predecessor edges and prefer Hubnot's lineage from exact status when available. An exact route never silently advances. An explicit lineage-entry request resolves a unique current candidate or shows a picker. | FR-001, FR-002, NFR-002. Cover siblings, a visible successor with a hidden predecessor, merged/closed lineages, and empty or partial discovery. |
| IC-03 — Conversation and Checks | After IC-01 and the candidate interface from IC-02, render candidate-attributed signed history. Use Hubnot's evaluated counts, named pipelines, protected checks, and decision state. Keep qualified evidence, observed disagreement, and stage readiness distinct. | FR-003, FR-004, FR-006. Compare fixture UI data to exact native JSON and verify a late review stays on its predecessor. |
| IC-04 — Next steps and review | After IC-01 and IC-02, derive guidance from state, deficits, and independently inspected identity. Reuse existing review write path. Render only applicable controls and explain unmet prerequisites or CLI handoffs. Re-fetch the same exact URL after success. | FR-005, NFR-001. Test reviewer eligibility and observed-versus-executable state, refusal, and success pinned to the submitted candidate. |
| IC-05 — Exact file comparison | After IC-01 and the candidate interface, validate signed base and head against the repo's object format and require each object to be the exact available commit. Compare only those objects on demand. Bound file count and patch size, and report partial or unavailable output explicitly. | FR-003, FR-006. Move a local branch after opening the candidate and confirm the comparison stays fixed. Cover missing objects, binary, renamed, and unusually named paths. |
| IC-06 — Integrated verification | Exercise list → revision choice → all views → existing review from a single fixture. Validate the user-visible error states and run the quality checks before handoff. | All FRs and NFRs. Keep dependency and signing fixtures disposable. |

## Design decisions

### Exact identity and selected history

- The detail route is an exact candidate link by default. The Proposals list may add a distinct lineage-entry query mode to request current-candidate selection. That mode resolves to an exact URL once chosen. Use native lineage state where available. If the current candidate cannot be established, show a picker or partial state. Never select a live sibling by timestamp.
- Treat SQLite as a set of IDs to investigate. A verified row alone does not prove admission to selected history. Do not expose its title, identifiers, body, status, or evidence until the relevant native response establishes visibility. If status fails but exact event read succeeds, show that verified candidate and any independently visible evidence with readiness unknown. Do not use raw `hn log`, human CLI prose, or worktree policy as substitutes.
- For discovery, group and page verified local hints before starting native calls. Cap concurrency and total work per request, deduplicate exact reads within that request, and avoid cross-request caching of visibility or readiness. Provide a continuation or partial-data message when scanning is incomplete. An index missing a newer event must not override a native exact candidate or lineage read.

### Evidence and next actions

- Native status supplies the exact requirement counts, proof references, disagreements, and qualified decisions. Event details enrich a row only after exact visibility verification. Link run results through the verified request's subject, and reviews and decisions through their candidate subject.
- Keep evidence readiness, acceptance, and merge separate. Use observed preconditions for wording like “Ready for maintainer decision” or “Observed merge conditions met.” Do not claim a user can merge without a verified actor and write-time repository checks. A later review can invalidate evidence readiness without erasing the prior acceptance.
- Derive guidance for known blockers first. Show code or policy recovery, qualified reviewers, named pipeline and trusted runner needs, protected-check review, and maintainer acceptance where relevant. Leave explicit unknowns when capability, identity, or evidence is missing. Keep the existing review operation, and let Hubnot enforce policy and freshness on write.
- For Files changed, use exact validated OIDs with shell-free Git invocation, NUL-delimited file metadata, literal path selection, and external diff and text conversion disabled. Suppress lazy network fetch where supported and do not fall back to branches or worktree content. Render patch and path strings as text.

## Rollout and risks

- **Older binaries or shallow local data** — Show a controlled degraded state and recovery direction when known. Continue to support the existing proposal creation form. No new mutation path depends on capability discovery.
- **Policy drift or stale UI state** — Evaluate on read, recheck through Hubnot on review submission, and refresh the exact candidate. Never report review success from cached data.
- **Large or incomplete lineage** — Bound reads and make completeness visible. Avoid a false empty list when native lookups fail.
- **Existing event shape drift** — Read signed subject relationships and native structured output. Do not derive grouping from the UI's old event-kind branches.

Supporting artifacts include [research](research.md), the [data model](data-model.md), [interface contracts](contracts/proposal-detail.md), and the [acceptance guide](quickstart.md).
