---
work_package_id: WP06
title: Production parity and proposal recovery verification
dependencies:
- WP04
- WP05
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- FR-008
- FR-009
planning_base_branch: feat/pipeline-graph-editor
merge_target_branch: feat/pipeline-graph-editor
branch_strategy: Land changes on feat/pipeline-graph-editor.
subtasks:
- T014
- T015
- T016
history: []
agent_profile: node-norris
authoritative_surface: tests/
create_intent:
- tests/pipeline-graph-parity.test.ts
execution_mode: code_change
owned_files:
- tests/pipeline-graph-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP06 — Production parity and proposal recovery verification

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T014** Run the same draft and template edits through production HTTP and MCP. Compare structured nodes, edges, JSON bytes, diagnostics, catalog revisions and exact diffs.
- **T015** Submit through the existing native proposal capability and verify candidate bytes, signer, stale base, and retry after a lost response without a duplicate event. Verify older Hubnot capability fallback and keep fixtures disposable.
- **T016** Record keyboard browser checks, focused and existing Settings regressions, lint, TypeScript, and production build evidence. Reserve full OS qualification for release.

## Review evidence

Trace evidence to AC-01 through AC-06. Verify preview and editing leave Git refs, index, worktree, and signed history unchanged.

Acceptance coverage AC-01, AC-02, AC-03, AC-04, AC-05, AC-06.
