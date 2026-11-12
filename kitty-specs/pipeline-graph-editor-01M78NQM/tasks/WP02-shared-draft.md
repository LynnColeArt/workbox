---
work_package_id: WP02
title: Shared Graph and JSON draft
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-005
- FR-006
- FR-008
- FR-009
planning_base_branch: feat/pipeline-graph-editor
merge_target_branch: feat/pipeline-graph-editor
branch_strategy: Land changes on feat/pipeline-graph-editor.
subtasks:
- T003
- T004
- T005
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/pipeline-draft.ts
- tests/pipeline-draft.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/pipeline-draft.ts
- tests/pipeline-draft.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Shared Graph and JSON draft

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T003** Open and refresh a client-owned draft at a pinned base. Define revision checks, ordered nodes and edges, draft-scoped identifiers, and diagnostics.
- **T004** Apply add, template expansion, patch, duplicate, reorder, and remove operations through one reducer. Serialize deliberate graph edits deterministically and keep editor metadata outside the definition.
- **T005** Preserve exact JSON text, distinguish graph-authored incomplete drafts from unprojectable manual edits, and implement explicit last-valid restoration. Revalidate client input and derive graph state from authoritative text.

## Review evidence

Verify tab-neutral round trips, stale snapshot edits, duplicate keys, representability failures, invalid draft retention, deterministic edits, and refresh without rewriting expanded nodes.

Acceptance coverage AC-01, AC-02, AC-03.
