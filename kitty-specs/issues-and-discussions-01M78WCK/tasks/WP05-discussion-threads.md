---
work_package_id: WP05
title: Discussion discovery, thread creation and replies
dependencies:
- WP02
- WP03
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
subtasks:
- T012
- T013
- T014
owned_files:
- 'src/app/p/[[]id]/discussions/**'
- 'src/app/api/projects/[id]/discussions/route.ts'
- 'src/lib/workbox/discussions.ts'
- 'mcp/discussions.ts'
- 'tests/discussions-parity.test.ts'
history: []
authoritative_surface: src/
create_intent:
- 'src/app/api/projects/[id]/discussions/route.ts'
- 'src/lib/workbox/discussions.ts'
- 'mcp/discussions.ts'
- 'tests/discussions-parity.test.ts'
execution_mode: code_change
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP05 — Discussion discovery, thread creation and replies

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

Discussion list and detail pages, thread and reply service, and matching HTTP/MCP operations.

## Subtasks

- **T012** Replace the event feed with a paginated category and status list and stable thread detail. Render synced posts, replies and the accepted answer using verified native reads and bounded pagination.
- **T013** Wire categorized thread creation and top-level or contextual replies to both transports using the shared composer and signed action service. Keep the reply target visible before and after posting.
- **T014** Keep reply root IDs distinct from revisions and handle missing history and stale pagination with actionable states.

## Review evidence

Create and read threads across both transports. Exercise filters, pagination, synced content and a retry after posting that produces a single reply.
