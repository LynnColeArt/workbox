---
work_package_id: WP02
title: Shared permissions and signed action service
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-005
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
subtasks:
- T003
- T004
- T005
owned_files:
- 'mcp/discussions.ts'
- 'mcp/issues.ts'
- 'src/lib/workbox/collaboration.ts'
- 'src/lib/hn/collaboration.ts'
- 'mcp/server.ts'
- 'tests/collaboration-service.test.ts'
history: []
authoritative_surface: src/lib/
create_intent:
- 'mcp/discussions.ts'
- 'mcp/issues.ts'
- 'src/lib/workbox/collaboration.ts'
- 'src/lib/hn/collaboration.ts'
- 'tests/collaboration-service.test.ts'
execution_mode: code_change
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Shared permissions and signed action service

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

Shared modules under src/lib/workbox and src/lib/hn plus focused service tests.

## Subtasks

- **T003** Define common validated inputs and typed outcomes for HTTP and MCP, including resource IDs, cursors, expected revisions, operation IDs, actor choices, and available actions.
- **T004** Resolve usable actors from caller context. Show equivalent availability reasons on both surfaces and require native authorization on every write. Preserve existing issue tools through compatibility adapters. Establish and register the issue and discussion MCP modules with buildable initial exports. Later packages extend those modules.
- **T005** Bind retries to the original operation and resolve signed outcomes through Hubnot. Refresh the index independently and return canonical IDs, revisions, and indexing state.

## Review evidence

Exercise identity substitution, permission denial, stale writes, and replay after signing or indexing failure. Show a repeated operation produces one signed change.
