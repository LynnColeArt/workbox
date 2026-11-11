---
work_package_id: WP05
title: macOS protocol handler
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
- T015
- T016
- T017
phase: Integration
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: implementer-ivan
authoritative_surface: scripts/address-handler/macos/
create_intent:
- scripts/address-handler/macos/WorkboxAddressHandler.swift
- scripts/address-handler/macos/Info.plist
- scripts/address-handler/macos/build.sh
- scripts/address-handler/macos/README.md
execution_mode: code_change
owned_files:
- scripts/address-handler/macos/WorkboxAddressHandler.swift
- scripts/address-handler/macos/Info.plist
- scripts/address-handler/macos/build.sh
- scripts/address-handler/macos/README.md
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP05 — macOS protocol handler

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `implementer-ivan` with the Spec Kitty profile-load skill before starting the package.

## Objective

A signed macOS release-candidate bundle passes DL-002 and can be removed without affecting in-app entry.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are WP02. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T015 — Build the AppKit URL receiver

Bundle a Swift/AppKit helper declaring workbox in CFBundleURLTypes. Handle URL activation on cold launch and when the helper is running. Read the per-user loopback origin and use the same readiness and fixed handoff contract as Linux. Use NSWorkspace to open the HTTP(S) URL.

### T016 — Document and package opt-in registration

Integrate with the macOS release signing process and document install, configuration, enable, upgrade, and removal. Respect system selection and confirmation. Report a failed probe or denied launch without trying to start Workbox.

### T017 — Exercise macOS and Safari handoff

Follow DL-002 with Safari as default and a non-default port. Test cold and repeated activation, compare with paste, exercise cancellation and unavailable Workbox, and record OS, browser, and build.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-002`, `FR-005`, `NFR-002`, `C-001`, `C-002`, `C-003` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
