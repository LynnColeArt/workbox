# Work packages — Proposal detail and next actions

- **Planning and merge target** `feat/proposal-detail`
- **Inputs** [Spec](spec.md), [plan](plan.md), [data model](data-model.md), [interfaces](contracts/proposal-detail.md), and [acceptance guide](quickstart.md)

## Dependency overview

WP01 provides native reads. WP02 builds the lineage and exact-candidate selection layer. WP03, WP04, and WP06 can proceed independently after WP02. WP05 uses the policy view data from WP04. WP07 alone owns the detail route and composes the preceding packages.

## Work Package WP01 — Native proposal reads and visibility (Priority: P1)

- **Prompt** [WP01-native-proposal-reads.md](tasks/WP01-native-proposal-reads.md)
- **Dependencies**: None
- **Independent acceptance** Fixture tests prove that only an exact, visible native response can supply identity or evaluation.
- **Owned surfaces** `src/lib/hn/proposal-read.ts`, `tests/proposal-read.test.ts`

T001 Define the structured read contract (WP01)
T002 Return controlled, separate availability results (WP01)
T003 Verify failure and visibility boundaries (WP01)

## Work Package WP02 — Visible lineages and exact candidate selection (Priority: P1)

- **Prompt** [WP02-proposal-lineages.md](tasks/WP02-proposal-lineages.md)
- **Dependencies**: WP01
- **Independent acceptance** A scoped fixture proves grouping, stable candidate selection, and visibility without inferring readiness from the index.
- **Owned surfaces** `src/app/p/[id]/proposals/page.tsx`, `src/lib/workbox/proposal-detail.ts`, `tests/proposal-lineage.test.ts`

T004 Discover visible lineage entries (WP02)
T005 Resolve exact and lineage-entry requests (WP02)
T006 Update the Proposals list (WP02)

## Work Package WP03 — Candidate header and signed Conversation (Priority: P1)

- **Prompt** [WP03-candidate-conversation.md](tasks/WP03-candidate-conversation.md)
- **Dependencies**: WP02
- **Independent acceptance** Header and Conversation components render only the selected candidate and correctly attributed visible history.
- **Owned surfaces** `src/components/proposal-detail-header.tsx`, `src/components/proposal-conversation.tsx`, `src/lib/workbox/proposal-conversation.ts`, `tests/proposal-conversation.test.ts`

T007 Render selected candidate and revision navigation (WP03)
T008 Attribute signed evidence to the correct revision (WP03)
T009 Test rendering and history boundaries (WP03)

## Work Package WP04 — Candidate policy blockers and Checks view (Priority: P1)

- **Prompt** [WP04-policy-blockers.md](tasks/WP04-policy-blockers.md)
- **Dependencies**: WP02
- **Independent acceptance** Checks matches exact native policy and never marks an unavailable or stale candidate ready.
- **Owned surfaces** `src/components/proposal-checks.tsx`, `src/lib/workbox/proposal-checks.ts`, `tests/proposal-checks.test.ts`

T010 Build the policy status view data (WP04)
T011 Render Checks and stage summaries (WP04)
T012 Verify nuanced and unavailable states (WP04)

## Work Package WP05 — Next actions and exact-candidate review (Priority: P1)

- **Prompt** [WP05-proposal-next-actions.md](tasks/WP05-proposal-next-actions.md)
- **Dependencies**: WP02, WP04
- **Independent acceptance** Next actions explain who can act, and the only browser mutation is the existing exact-candidate review.
- **Owned surfaces** `src/components/review-buttons.tsx`, `src/app/api/projects/[id]/review/route.ts`, `src/lib/workbox/proposal-actions.ts`, `src/components/proposal-next-actions.tsx`, `tests/proposal-actions.test.ts`

T013 Derive specific next-step guidance (WP05)
T014 Reuse and pin the existing review operation (WP05)
T015 Test guidance and write outcomes (WP05)

## Work Package WP06 — Exact base-to-head file comparison (Priority: P1)

- **Prompt** [WP06-exact-file-comparison.md](tasks/WP06-exact-file-comparison.md)
- **Dependencies**: WP02
- **Independent acceptance** Files changed is pinned to exact commits and reports limits without showing substitute code.
- **Owned surfaces** `src/lib/workbox/proposal-comparison.ts`, `src/components/proposal-files-changed.tsx`, `tests/proposal-comparison.test.ts`

T016 Read changes from the signed commit pair (WP06)
T017 Render file list and selected patch (WP06)
T018 Verify branch independence and edge paths (WP06)

## Work Package WP07 — Integrate and verify the proposal detail route (Priority: P1)

- **Prompt** [WP07-proposal-detail-integration.md](tasks/WP07-proposal-detail-integration.md)
- **Dependencies**: WP02, WP03, WP04, WP05, WP06
- **Independent acceptance** The real proposal route delivers exact revision, native blockers, and applicable next actions through the integrated feature.
- **Owned surfaces** `src/app/p/[id]/proposals/[candidateId]/page.tsx`, `tests/proposal-detail-web.test.ts`

T019 Compose the exact-candidate page (WP07)
T020 Exercise the integrated browser journey (WP07)
T021 Run focused quality checks (WP07)
