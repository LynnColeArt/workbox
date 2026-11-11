---
work_package_id: WP03
title: MCP resource discovery and compatibility
dependencies:
- WP01
requirement_refs:
- C-001
- C-002
- C-004
- FR-001
- FR-004
- FR-005
- NFR-002
planning_base_branch: feat/workbox-urls
merge_target_branch: feat/workbox-urls
branch_strategy: Planning artifacts for this mission were generated on feat/workbox-urls. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/workbox-urls unless the human explicitly redirects the landing branch.
subtasks:
- T008
- T009
- T010
- T011
phase: Integration
history:
- timestamp: '2026-11-11T15:39:43Z'
  agent: codex
  action: Authored for Spec Kitty task finalization
agent_profile: node-norris
authoritative_surface: mcp/
create_intent:
- tests/workbox-address-mcp.test.ts
execution_mode: code_change
owned_files:
- mcp/server.ts
- tests/workbox-address-mcp.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — MCP resource discovery and compatibility

## ⚡ Do This First: Load Agent Profile

When implementation is authorized, load `node-norris` with the Spec Kitty profile-load skill before starting the package.

## Objective

An MCP client can discover canonical URLs and read the same resources with all saved legacy URLs.

## Context and ownership

Read the [spec](../spec.md), [plan](../plan.md), [interface contract](../contracts/address-interfaces.md), and [acceptance guide](../quickstart.md). The frontmatter owns this package’s files. Open a planning amendment if an integration needs ownership of a file held by another package. Use disposable fixtures for runtime verification. Keep dependencies and behavior within the approved plan.

## Branch strategy

The planning and merge target is `feat/workbox-urls`. Spec Kitty allocates execution worktrees from the finalized lane configuration after implementation is authorized. Dependencies for this package are WP01. Use the mission’s runtime to claim this package at that time.

## Subtasks

### T008 — Publish canonical MCP addresses

Use the shared formatter in resources/list. Add Workbox home and the project directory, retain existing metadata fields, and expose only one canonical entry per resource. Leave Trending undiscoverable.

### T009 — Preserve all four legacy reads

Dispatch canonical and legacy addresses through the same typed target. Reuse project, issue, memory, and pipeline projections. Echo the requested URI in contents and retain payload field names and types. Resolve home from instance statistics and the directory from the existing project list projection.

### T010 — Apply resource redaction and controlled errors

Apply the existing sanitizer to payloads and user-derived discovery labels without modifying routing fields. Keep local repository paths out of the project projection. Preserve access checks and JSON-RPC resource-read error behavior. Never turn a read into a tool call or write.

### T011 — Verify the real stdio protocol with fixtures

Compare parsed payloads for all four legacy and canonical pairs. Verify the outer URI and schema, canonical discovery, redaction, missing and malformed inputs, and reserved views. Use a disposable index and do not run the signed-write demo self-test.

## Verification and definition of done

- Complete the checks described in each subtask and provide reproducible commands, fixture details, or release-candidate evidence.
- Verify `FR-001`, `FR-004`, `FR-005`, `NFR-002`, `C-001`, `C-002`, `C-004` against the spec and address contract.
- For application changes, run `npx tsc --noEmit` and `npm run build` before committing. For platform adapters, also verify the relevant native build and browser handoff.
- Keep task completion in the Spec Kitty event log. Do not change status in this prompt.

## Reviewer guidance

Check that the independent acceptance result is backed by evidence and that touched files match the declared ownership. Check that no address selects an external origin, triggers a mutation, or bypasses existing visibility rules. Confirm that platform support claims are backed by that platform’s actual browser test.
