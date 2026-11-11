---
work_package_id: WP07
title: Integrate and verify the proposal detail route
dependencies:
- WP02
- WP03
- WP04
- WP05
- WP06
requirement_refs:
- C-001
- C-002
- C-003
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
- NFR-001
- NFR-002
planning_base_branch: feat/proposal-detail
merge_target_branch: feat/proposal-detail
branch_strategy: Planning artifacts for this mission were generated on feat/proposal-detail. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/proposal-detail unless the human explicitly redirects the landing branch.
subtasks:
- T019
- T020
- T021
phase: Integration verification
history:
- timestamp: '2026-11-11T19:41:46Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: frontend-freddy
authoritative_surface: src/app/
create_intent:
- src/app/p/[id]/proposals/[candidateId]/page.tsx
- tests/proposal-detail-web.test.ts
execution_mode: code_change
owned_files:
- src/app/p/[[]id]/proposals/[[]candidateId]/page.tsx
- tests/proposal-detail-web.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP07 — Integrate and verify the proposal detail route

## ⚡ Do This First: Load Agent Profile

Load `frontend-freddy` with the Spec Kitty profile-load skill when implementation is authorized.

## Objective

The real proposal route delivers exact revision, native blockers, and applicable next actions through the integrated feature.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [data model](../data-model.md), and [interfaces](../contracts/proposal-detail.md). The frontmatter declares this package's file ownership. Read the installed Next.js guides before coding. Use disposable repos, indexes, and signer fixtures. Do not add dependencies or write operations outside the plan.

## Branch strategy

The planning and merge target is `feat/proposal-detail`. Spec Kitty assigns execution lanes after implementation is authorized. Package dependencies are WP02, WP03, WP04, WP05, WP06. Keep changes within this package, including during integration and review.

## Subtasks

### T019 — Compose the exact-candidate page

Use the existing Next.js request-time conventions. Validate candidate ID and view inputs, integrate lineage selection, header, Conversation, Checks, next actions, and on-demand Files changed. Keep status and next actions visible across views and keep unknown and hidden targets indistinguishable.

### T020 — Exercise the integrated browser journey

From the Proposals list, choose among sibling candidates, open stable exact links, switch views, and submit the existing review with a disposable signer. Verify results and evidence against native status, including a refused write, missing policy, and missing comparison data.

### T021 — Run focused quality checks

Verify keyboard navigation, run scoped lint, TypeScript, the production build, and all proposal-focused tests. Keep the integrated fixture disposable and leave full OS release qualification for the final release process.

## Verification and definition of done

- Provide reproducible fixture or test evidence for the acceptance in this prompt and the mapped requirements in the frontmatter.
- Run scoped ESLint, `npx tsc --noEmit`, and `npm run build` for application changes. Use focused tests, with no release-level OS matrix during this feature.
- Record subtask and package state through Spec Kitty. Keep native readiness, exact candidate identity, and browser capabilities distinct.

## Reviewer guidance

Check scope against file ownership, validate behavior against the native contract, and look for accidental evidence inheritance or claims based on incomplete status. Check that hidden data is never exposed through list entries, links, error output, or file selection.
