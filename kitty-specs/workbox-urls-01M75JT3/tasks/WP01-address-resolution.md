---
work_package_id: WP01
title: Shared address parsing and lookup
dependencies: []
requirement_refs:
- C-001
- C-002
- FR-001
- FR-005
- NFR-002
planning_base_branch: feat/workbox-urls
merge_target_branch: feat/workbox-urls
branch_strategy: Planning artifacts for this mission were generated on feat/workbox-urls. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/workbox-urls unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
phase: Foundation
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent:
- src/lib/workbox/address.ts
- src/lib/workbox/address-resolution.ts
- tests/workbox-address.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/address.ts
- src/lib/workbox/address-resolution.ts
- tests/workbox-address.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Shared address parsing and lookup

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `node-norris` with the Spec Kitty profile-load skill before starting the package.

## Objective

Parser and fixture-backed lookup tests pass. No Next.js or MCP route changes.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are empty. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T001 — Parse and format Workbox addresses

Implement the target union from the data model and the canonical address table. Validate the raw structure before any normalization. Accept both singular and plural project spellings and one optional terminal slash. Preserve slug case and parse a numbered issue only when it is a positive safe integer.

### T002 — Resolve project and issue identity

Use existing project and issue reads to resolve the slug and project-scoped issue number. Return typed targets or controlled errors. Keep parsing independent of SQLite and framework imports. Keep authorization and visibility at the calling surface and avoid repository and database writes.

### T003 — Verify canonical, alias, and invalid cases

Use table-driven Node tests for all canonical targets and four aliases, round trips, slash handling, and invalid delimiters, numbers, and traversal. Fixture tests must distinguish the same issue number in two projects and report a missing target safely.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-001`, `FR-005`, `NFR-002`, `C-001`, `C-002` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
