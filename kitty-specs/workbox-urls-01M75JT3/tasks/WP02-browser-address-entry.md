---
work_package_id: WP02
title: Browser address entry and readiness endpoint
dependencies:
- WP01
requirement_refs:
- C-001
- C-002
- C-003
- C-004
- FR-001
- FR-003
- FR-005
- NFR-001
planning_base_branch: feat/workbox-urls
merge_target_branch: feat/workbox-urls
branch_strategy: Planning artifacts for this mission were generated on feat/workbox-urls. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/workbox-urls unless the human explicitly redirects the landing branch.
subtasks:
- T004
- T005
- T006
- T007
phase: Integration
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: frontend-freddy
authoritative_surface: src/app/
create_intent:
- src/app/open/page.tsx
- src/app/api/address-handler/route.ts
- tests/workbox-address-web.test.ts
execution_mode: code_change
owned_files:
- src/app/layout.tsx
- src/app/open/page.tsx
- src/app/api/address-handler/route.ts
- tests/workbox-address-web.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Browser address entry and readiness endpoint

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `frontend-freddy` with the Spec Kitty profile-load skill before starting the package.

## Objective

A fresh fixture instance supports address entry without an installed handler and returns the documented readiness response.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are WP01. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T004 — Add the Open address page and navigation

Link the global navigation to /open. Render a labeled native GET form that submits one address value. Trim the paste input and retain the original on errors. Report errors in text accessible to keyboard and assistive technology users.

### T005 — Resolve pasted and handed-off addresses

Read the installed Next.js page and redirect docs before coding. Use request-time server resolution and the repository's connection and instant conventions. Redirect only to known internal paths. Encode full issue IDs as a route segment. Handle missing, invalid, and unavailable targets. Treat Trending as reserved and Explore as unavailable until its own route ships.

### T006 — Expose the handler readiness probe

Implement the constant HEAD contract with status 204 and Workbox-Address-Handler: 1. Perform no project lookup and accept no address input. Follow the installed Next.js route-handler guide.

### T007 — Verify web entry and readiness

Exercise the keyboard-only and JavaScript-disabled form, direct handoff, aliases, unknown and unavailable destinations, duplicate query inputs, and invalid address errors. Check the exact readiness marker and verify every successful redirect stays inside the current instance.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-001`, `FR-003`, `FR-005`, `NFR-001`, `C-001`, `C-002`, `C-003`, `C-004` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
