---
work_package_id: WP04
title: Shared Settings HTTP and MCP operations
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-003
- FR-007
- FR-008
- FR-009
planning_base_branch: feat/pipeline-graph-editor
merge_target_branch: feat/pipeline-graph-editor
branch_strategy: Land changes on feat/pipeline-graph-editor.
subtasks:
- T009
- T010
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent: []
execution_mode: code_change
owned_files:
- src/lib/workbox/settings-operations.ts
- src/app/api/projects/[[]id]/settings/route.ts
- mcp/server.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Shared Settings HTTP and MCP operations

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T009** Expose draft open and refresh, catalog read, typed edits and review through the shared Settings dispatcher, HTTP, and MCP. Validate the same public inputs and project the same results and errors.
- **T010** Preserve existing Settings tool schemas and authorization. Use the existing explicit proposal submission operation and verify that exact drafts, diagnostics, links, and recovery outcomes pass through both transports.

## Review evidence

Check tool discovery and schema consistency, malformed inputs, and the same controlled outcomes across transports.

Acceptance coverage AC-01, AC-02, AC-04, AC-05, AC-06.
