---
work_package_id: WP06
title: Windows protocol handler
dependencies:
- WP02
requirement_refs:
- C-001
- C-002
- C-003
- FR-002
- FR-005
- NFR-002
planning_base_branch: feat/workbox-urls
merge_target_branch: feat/workbox-urls
branch_strategy: Planning artifacts for this mission were generated on feat/workbox-urls. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/workbox-urls unless the human explicitly redirects the landing branch.
subtasks:
- T018
- T019
- T020
phase: Integration
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: implementer-ivan
authoritative_surface: scripts/address-handler/windows/
create_intent:
- scripts/address-handler/windows/WorkboxAddressHandler.cpp
- scripts/address-handler/windows/README.md
- scripts/address-handler/windows/build.ps1
execution_mode: code_change
owned_files:
- scripts/address-handler/windows/WorkboxAddressHandler.cpp
- scripts/address-handler/windows/README.md
- scripts/address-handler/windows/build.ps1
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP06 — Windows protocol handler

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `implementer-ivan` with the Spec Kitty profile-load skill before starting the package.

## Objective

The upcoming Windows release candidate passes DL-003. Linux or macOS evidence cannot substitute for this result.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are WP02. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T018 — Implement native Windows activation and browser launch

Receive the URI through the chosen Windows activation API. Use the per-user loopback origin, bounded readiness probe, and fixed encoded /open handoff. Launch the user's default browser through the OS. Keep the URI as data and report invalid configuration or an unavailable server.

### T019 — Wire registration to the Windows release candidate

Choose the integration based on the actual Windows package: a protocol declaration for a packaged build or supported unpackaged registration for its installer. Provide a native build entry point in build.ps1. If the chosen package format needs additional registration assets or release-pipeline edits, record their exact ownership before editing. Document opt-in, configuration, upgrade, and uninstall.

### T020 — Exercise Windows and Edge handoff

Follow DL-003 on the upcoming Windows release candidate with Edge as default and a non-default port. Compare with paste, check failed readiness and cancellation when prompted, and record OS, browser, build, and result. If the candidate is unavailable, leave this acceptance pending and identify the required artifact.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-002`, `FR-005`, `NFR-002`, `C-001`, `C-002`, `C-003` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
