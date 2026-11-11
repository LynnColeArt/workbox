---
work_package_id: WP06
title: Exact base-to-head file comparison
dependencies:
- WP02
requirement_refs:
- C-001
- C-002
- FR-002
- FR-003
- FR-006
- NFR-002
planning_base_branch: feat/proposal-detail
merge_target_branch: feat/proposal-detail
branch_strategy: Planning artifacts for this mission were generated on feat/proposal-detail. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/proposal-detail unless the human explicitly redirects the landing branch.
subtasks:
- T016
- T017
- T018
phase: Feature implementation
history:
- timestamp: '2026-11-11T19:41:46Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent:
- src/lib/workbox/proposal-comparison.ts
- src/components/proposal-files-changed.tsx
- tests/proposal-comparison.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/proposal-comparison.ts
- src/components/proposal-files-changed.tsx
- tests/proposal-comparison.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP06 — Exact base-to-head file comparison

## ⚡ Do This First: Load Agent Profile

Load `node-norris` with the Spec Kitty profile-load skill when implementation is authorized.

## Objective

Files changed is pinned to exact commits and reports limits without showing substitute code.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [data model](../data-model.md), and [interfaces](../contracts/proposal-detail.md). The frontmatter declares this package's file ownership. Read the installed Next.js guides before coding. Use disposable repos, indexes, and signer fixtures. Do not add dependencies or write operations outside the plan.

## Branch strategy

The planning and merge target is `feat/proposal-detail`. Spec Kitty assigns execution lanes after implementation is authorized. Package dependencies are WP02. Keep changes within this package, including during integration and review.

## Subtasks

### T016 — Read changes from the signed commit pair

Validate exact Git objects before invoking read-only diff. Use bounded output, literal path selection, and NUL-delimited metadata. Disable external diff and text conversion, suppress lazy network fetch where supported, and avoid worktree or branch fallback.

### T017 — Render file list and selected patch

Render text safely, require the selected file to come from the exact comparison, and explain binary, missing, and truncated data. Load comparison only for Files changed when wired in WP07.

### T018 — Verify branch independence and edge paths

Use disposable Git fixtures to move a branch after creating the signed pair, compare identical objects before and after, and cover missing commit, rename, binary, unusual paths, and rejected file selection.

## Verification and definition of done

- Provide reproducible fixture or test evidence for the acceptance in this prompt and the mapped requirements in the frontmatter.
- Run scoped ESLint, `npx tsc --noEmit`, and `npm run build` for application changes. Use focused tests, with no release-level OS matrix during this feature.
- Record subtask and package state through Spec Kitty. Keep native readiness, exact candidate identity, and browser capabilities distinct.

## Reviewer guidance

Check scope against file ownership, validate behavior against the native contract, and look for accidental evidence inheritance or claims based on incomplete status. Check that hidden data is never exposed through list entries, links, error output, or file selection.
