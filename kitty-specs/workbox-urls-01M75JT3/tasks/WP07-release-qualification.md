---
work_package_id: WP07
title: Release qualification and documentation
dependencies:
- WP02
- WP03
- WP04
- WP05
- WP06
requirement_refs:
- C-003
- C-004
- FR-002
- FR-003
- FR-004
- FR-005
- NFR-001
- NFR-002
planning_base_branch: feat/workbox-urls
merge_target_branch: feat/workbox-urls
branch_strategy: Planning artifacts for this mission were generated on feat/workbox-urls. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/workbox-urls unless the human explicitly redirects the landing branch.
subtasks:
- T021
- T022
- T023
phase: Release verification
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: implementer-ivan
authoritative_surface: docs/
create_intent:
- docs/workbox-addresses.md
execution_mode: code_change
owned_files:
- docs/workbox-addresses.md
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP07 — Release qualification and documentation

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `implementer-ivan` with the Spec Kitty profile-load skill before starting the package.

## Objective

Release notes and support claims match recorded acceptance. No release publication is part of this package.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are WP02, WP03, WP04, WP05, WP06. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T021 — Publish one address and setup guide

Document canonical and legacy examples, the paste fallback, MCP discovery and reads, platform opt-in and removal, and what to do when the configured instance is unavailable. Explain Explore and Trending availability. Link to the adapter-specific setup instructions.

### T022 — Run cross-surface regressions on integrated artifacts

Run typecheck and the production build, plus browser and read-only stdio fixture tests. Confirm no change to project files or signed events. Compare the destination from a desktop click, pasted address, and MCP resource on the same fixture.

### T023 — Collect release evidence per platform

Collect DL-001, DL-002, and DL-003 on the relevant release candidates, including configured port, matching target, versions, handler build, and result. Verify opt-in, upgrade, and uninstall. Keep claims specific to the platform evidence and record missing Windows evidence as pending.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-002`, `FR-003`, `FR-004`, `FR-005`, `NFR-001`, `NFR-002`, `C-003`, `C-004` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
