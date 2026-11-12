---
work_package_id: WP04
title: Complete browser and MCP issue management
dependencies:
- WP02
- WP03
requirement_refs:
- FR-001
- FR-003
- FR-004
- FR-005
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
subtasks:
- T009
- T010
- T011
owned_files:
- 'src/app/p/[[]id]/issue/**'
- 'src/app/p/[[]id]/issues/**'
- 'src/app/api/projects/[[]id]/issues/**'
- 'src/lib/workbox/issues.ts'
- 'mcp/issues.ts'
- 'tests/issues-parity.test.ts'
history: []
authoritative_surface: src/
create_intent:
- 'src/lib/workbox/issues.ts'
- 'mcp/issues.ts'
- 'tests/issues-parity.test.ts'
execution_mode: code_change
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Complete browser and MCP issue management

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

Issue pages and forms, issue service and adapters, and issue integration fixtures.

## Subtasks

- **T009** Deliver paginated open and closed issue lists with title, number and label filtering. Keep stable numbers and existing deep links. Render issue body and conversation using the shared Markdown renderer.
- **T010** Wire create, comment, title and description edits, label changes, close and reopen through the shared service and both transports. Show the acting identity and land on the signed issue after creation.
- **T011** Expose native revisions and authorized conflict resolution. Preserve draft text when permissions, validation or stale revisions interrupt a write.

## Review evidence

Complete the issue journey in the browser and over MCP using the same permissions, including a synced issue, a competing revision, and a denied mutation.
