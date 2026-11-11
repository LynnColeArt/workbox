---
work_package_id: WP04
title: Linux desktop protocol handler
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
- T012
- T013
- T014
phase: Integration
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: implementer-ivan
authoritative_surface: scripts/address-handler/linux/
create_intent:
- scripts/address-handler/linux/open-address.mjs
- scripts/address-handler/linux/install.sh
- scripts/address-handler/linux/workbox-address.desktop
- scripts/address-handler/linux/README.md
execution_mode: code_change
owned_files:
- scripts/address-handler/linux/open-address.mjs
- scripts/address-handler/linux/install.sh
- scripts/address-handler/linux/workbox-address.desktop
- scripts/address-handler/linux/README.md
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Linux desktop protocol handler

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `implementer-ivan` with the Spec Kitty profile-load skill before starting the package.

## Objective

A Linux release-candidate installation passes DL-001 on a supported desktop.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are WP02. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T012 — Implement the Linux opener

Use the existing Node runtime. Load a per-user HTTP(S) loopback origin, validate the port and origin settings, and run the bounded readiness probe without redirects. Encode the address once in the fixed /open handoff. Invoke the desktop URL opener with a single argument and no shell interpolation.

### T013 — Package opt-in Linux registration

Provide a user-scoped desktop entry and documented enable, configure, upgrade, and uninstall flows. Use an absolute handler path and one URL argument. Uninstall only Workbox-owned registration and settings. Report invalid settings, offline Workbox, and launch failures without starting services.

### T014 — Exercise Linux and Firefox handoff

Follow DL-001 with Firefox as default and a non-default port. Compare browser click with paste. Record the OS, browser, and handler build. Verify failed readiness, cancellation when prompted, and that pasting works after removal.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-002`, `FR-005`, `NFR-002`, `C-001`, `C-002`, `C-003` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
