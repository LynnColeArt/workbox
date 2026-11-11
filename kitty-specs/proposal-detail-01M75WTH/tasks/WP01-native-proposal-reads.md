---
work_package_id: WP01
title: Native proposal reads and visibility
dependencies: []
requirement_refs:
- C-001
- C-003
- FR-002
- FR-004
- FR-006
planning_base_branch: feat/proposal-detail
merge_target_branch: feat/proposal-detail
branch_strategy: Planning artifacts for this mission were generated on feat/proposal-detail. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/proposal-detail unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
phase: Foundation
history:
- timestamp: '2026-11-11T19:41:46Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: node-norris
authoritative_surface: src/lib/hn/
create_intent:
- src/lib/hn/proposal-read.ts
- tests/proposal-read.test.ts
execution_mode: code_change
owned_files:
- src/lib/hn/proposal-read.ts
- tests/proposal-read.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Native proposal reads and visibility

## ⚡ Do This First: Load Agent Profile

Load `node-norris` with the Spec Kitty profile-load skill when implementation is authorized.

## Objective

Fixture tests prove that only an exact, visible native response can supply identity or evaluation.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [data model](../data-model.md), and [interfaces](../contracts/proposal-detail.md). The frontmatter declares this package's file ownership. Read the installed Next.js guides before coding. Use disposable repos, indexes, and signer fixtures. Do not add dependencies or write operations outside the plan.

## Branch strategy

The planning and merge target is `feat/proposal-detail`. Spec Kitty assigns execution lanes after implementation is authorized. Package dependencies are empty. Keep changes within this package, including during integration and review.

## Subtasks

### T001 — Define the structured read contract

Use existing runHn argument-vector handling for capabilities, exact proposal status, selected-history event reads, and optional public identity inspection. Validate capability versions, envelope and schema, exact ID and kind, selected-history scope, and consumed payload fields.

### T002 — Return controlled, separate availability results

Keep candidate identity, evaluation, and actor availability independent. Map timeouts, unsupported versions, and malformed output to bounded recovery categories. Do not surface raw stderr, paths, or unadmitted payloads. Reject mismatched candidates or scopes before returning data.

### T003 — Verify failure and visibility boundaries

Use structured CLI fixtures for an exact match, wrong candidate, wrong event kind or scope, hidden event, absent capability, malformed envelope, timeout, and unavailable identity. Assert argv and repository selection are fixed by the caller.

## Verification and definition of done

- Provide reproducible fixture or test evidence for the acceptance in this prompt and the mapped requirements in the frontmatter.
- Run scoped ESLint, `npx tsc --noEmit`, and `npm run build` for application changes. Use focused tests, with no release-level OS matrix during this feature.
- Record subtask and package state through Spec Kitty. Keep native readiness, exact candidate identity, and browser capabilities distinct.

## Reviewer guidance

Check scope against file ownership, validate behavior against the native contract, and look for accidental evidence inheritance or claims based on incomplete status. Check that hidden data is never exposed through list entries, links, error output, or file selection.
