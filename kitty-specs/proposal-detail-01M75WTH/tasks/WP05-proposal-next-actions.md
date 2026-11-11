---
work_package_id: WP05
title: Next actions and exact-candidate review
dependencies:
- WP02
- WP04
requirement_refs:
- C-001
- C-003
- FR-005
- FR-006
- NFR-001
- NFR-002
planning_base_branch: feat/proposal-detail
merge_target_branch: feat/proposal-detail
branch_strategy: Planning artifacts for this mission were generated on feat/proposal-detail. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/proposal-detail unless the human explicitly redirects the landing branch.
subtasks:
- T013
- T014
- T015
phase: Feature implementation
history:
- timestamp: '2026-11-11T19:41:46Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent:
- src/lib/workbox/proposal-actions.ts
- src/components/proposal-next-actions.tsx
- tests/proposal-actions.test.ts
execution_mode: code_change
owned_files:
- src/components/review-buttons.tsx
- src/app/api/projects/[[]id]/review/route.ts
- src/lib/workbox/proposal-actions.ts
- src/components/proposal-next-actions.tsx
- tests/proposal-actions.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP05 — Next actions and exact-candidate review

## ⚡ Do This First: Load Agent Profile

Load `node-norris` with the Spec Kitty profile-load skill when implementation is authorized.

## Objective

Next actions explain who can act, and the only browser mutation is the existing exact-candidate review.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [data model](../data-model.md), and [interfaces](../contracts/proposal-detail.md). The frontmatter declares this package's file ownership. Read the installed Next.js guides before coding. Use disposable repos, indexes, and signer fixtures. Do not add dependencies or write operations outside the plan.

## Branch strategy

The planning and merge target is `feat/proposal-detail`. Spec Kitty assigns execution lanes after implementation is authorized. Package dependencies are WP02, WP04. Keep changes within this package, including during integration and review.

## Subtasks

### T013 — Derive specific next-step guidance

Use exact state, evaluated deficits, and independently inspected actor context. State who can act or what to recover. Treat identity and write capability as separate from observed preconditions. Show guidance for runner, acceptance, and merge steps without adding those write controls.

### T014 — Reuse and pin the existing review operation

Pass the selected full candidate ID and valid verdict to the existing review endpoint. Keep compatibility for existing callers, let Hubnot recheck authority, present a controlled refusal, and refresh the same exact candidate on success. Keep known unavailable operations disabled.

### T015 — Test guidance and write outcomes

Exercise known and unknown actors, available review, native refusal, accepted yet stale status, and context-specific CLI handoffs. Verify a successful write targets the exact submitted candidate and never replays or switches to a sibling.

## Verification and definition of done

- Provide reproducible fixture or test evidence for the acceptance in this prompt and the mapped requirements in the frontmatter.
- Run scoped ESLint, `npx tsc --noEmit`, and `npm run build` for application changes. Use focused tests, with no release-level OS matrix during this feature.
- Record subtask and package state through Spec Kitty. Keep native readiness, exact candidate identity, and browser capabilities distinct.

## Reviewer guidance

Check scope against file ownership, validate behavior against the native contract, and look for accidental evidence inheritance or claims based on incomplete status. Check that hidden data is never exposed through list entries, links, error output, or file selection.
