---
work_package_id: WP04
title: Candidate policy blockers and Checks view
dependencies:
- WP02
requirement_refs:
- C-001
- C-002
- FR-003
- FR-004
- FR-006
- NFR-001
planning_base_branch: feat/proposal-detail
merge_target_branch: feat/proposal-detail
branch_strategy: Planning artifacts for this mission were generated on feat/proposal-detail. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/proposal-detail unless the human explicitly redirects the landing branch.
subtasks:
- T010
- T011
- T012
phase: Feature implementation
history:
- timestamp: '2026-11-11T19:41:46Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: frontend-freddy
authoritative_surface: src/components/
create_intent:
- src/components/proposal-checks.tsx
- src/lib/workbox/proposal-checks.ts
- tests/proposal-checks.test.ts
execution_mode: code_change
owned_files:
- src/components/proposal-checks.tsx
- src/lib/workbox/proposal-checks.ts
- tests/proposal-checks.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Candidate policy blockers and Checks view

## ⚡ Do This First: Load Agent Profile

Load `frontend-freddy` with the Spec Kitty profile-load skill when implementation is authorized.

## Objective

Checks matches exact native policy and never marks an unavailable or stale candidate ready.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [data model](../data-model.md), and [interfaces](../contracts/proposal-detail.md). The frontmatter declares this package's file ownership. Read the installed Next.js guides before coding. Use disposable repos, indexes, and signer fixtures. Do not add dependencies or write operations outside the plan.

## Branch strategy

The planning and merge target is `feat/proposal-detail`. Spec Kitty assigns execution lanes after implementation is authorized. Package dependencies are WP02. Keep changes within this package, including during integration and review.

## Subtasks

### T010 — Build the policy status view data

Use the typed native evaluation directly for code match, ordinary and protected reviews, configured pipeline pass counts, maintainer decisions, and observed preconditions. Do not recount raw events or load worktree policy.

### T011 — Render Checks and stage summaries

Show missing requirements and counts for the exact revision, including project-defined names. Distinguish evidence readiness, recorded acceptance, and merge. Show qualified versus observed evidence and change requests without treating all change requests as blockers.

### T012 — Verify nuanced and unavailable states

Compare fixture values to native status for custom thresholds, protected checks, accepted but no longer ready, superseded but evidence-ready, and status unavailable. Check the text remains useful without color.

## Verification and definition of done

- Provide reproducible fixture or test evidence for the acceptance in this prompt and the mapped requirements in the frontmatter.
- Run scoped ESLint, `npx tsc --noEmit`, and `npm run build` for application changes. Use focused tests, with no release-level OS matrix during this feature.
- Record subtask and package state through Spec Kitty. Keep native readiness, exact candidate identity, and browser capabilities distinct.

## Reviewer guidance

Check scope against file ownership, validate behavior against the native contract, and look for accidental evidence inheritance or claims based on incomplete status. Check that hidden data is never exposed through list entries, links, error output, or file selection.
