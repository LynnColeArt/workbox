---
work_package_id: WP03
title: Candidate header and signed Conversation
dependencies:
- WP02
requirement_refs:
- C-001
- C-002
- FR-002
- FR-003
- FR-006
- NFR-001
- NFR-002
planning_base_branch: feat/proposal-detail
merge_target_branch: feat/proposal-detail
branch_strategy: Planning artifacts for this mission were generated on feat/proposal-detail. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/proposal-detail unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
phase: Feature implementation
history:
- timestamp: '2026-11-11T19:41:46Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: frontend-freddy
authoritative_surface: src/components/
create_intent:
- src/components/proposal-detail-header.tsx
- src/components/proposal-conversation.tsx
- src/lib/workbox/proposal-conversation.ts
- tests/proposal-conversation.test.ts
execution_mode: code_change
owned_files:
- src/components/proposal-detail-header.tsx
- src/components/proposal-conversation.tsx
- src/lib/workbox/proposal-conversation.ts
- tests/proposal-conversation.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Candidate header and signed Conversation

## ⚡ Do This First: Load Agent Profile

Load `frontend-freddy` with the Spec Kitty profile-load skill when implementation is authorized.

## Objective

Header and Conversation components render only the selected candidate and correctly attributed visible history.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [data model](../data-model.md), and [interfaces](../contracts/proposal-detail.md). The frontmatter declares this package's file ownership. Read the installed Next.js guides before coding. Use disposable repos, indexes, and signer fixtures. Do not add dependencies or write operations outside the plan.

## Branch strategy

The planning and merge target is `feat/proposal-detail`. Spec Kitty assigns execution lanes after implementation is authorized. Package dependencies are WP02. Keep changes within this package, including during integration and review.

## Subtasks

### T007 — Render selected candidate and revision navigation

Build a header with full IDs available, exact base/head, revision selection, current or historical state, and keyboard-usable Conversation, Checks, and Files changed navigation. Build links to exact candidates and preserve the selected view where applicable.

### T008 — Attribute signed evidence to the correct revision

Use verified local event IDs as hints and verify selected-history visibility before displaying evidence. Attach reviews and decisions by candidate subject, and results by a verified request subject. Label historical evidence by its original candidate. Limit enrichment and show incomplete history without inventing status.

### T009 — Test rendering and history boundaries

Use candidate fixtures with late predecessor reviews, sibling decisions, and run request/result pairs. Verify no hidden event or hidden link is rendered and no evidence changes candidate when the user changes revisions. Test keyboard-oriented markup.

## Verification and definition of done

- Provide reproducible fixture or test evidence for the acceptance in this prompt and the mapped requirements in the frontmatter.
- Run scoped ESLint, `npx tsc --noEmit`, and `npm run build` for application changes. Use focused tests, with no release-level OS matrix during this feature.
- Record subtask and package state through Spec Kitty. Keep native readiness, exact candidate identity, and browser capabilities distinct.

## Reviewer guidance

Check scope against file ownership, validate behavior against the native contract, and look for accidental evidence inheritance or claims based on incomplete status. Check that hidden data is never exposed through list entries, links, error output, or file selection.
