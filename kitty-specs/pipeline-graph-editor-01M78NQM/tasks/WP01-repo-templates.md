---
work_package_id: WP01
title: Pinned repository template catalog
dependencies: []
requirement_refs:
- FR-003
- FR-004
planning_base_branch: feat/pipeline-graph-editor
merge_target_branch: feat/pipeline-graph-editor
branch_strategy: Planning artifacts for this mission were generated on feat/pipeline-graph-editor. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/pipeline-graph-editor unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/pipeline-templates.ts
- tests/pipeline-templates.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/pipeline-templates.ts
- tests/pipeline-templates.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Pinned repository template catalog

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T001** Read the regular UTF-8 catalog blob at the pinned Git commit. Return its source link, availability state, valid entries and path diagnostics within the planned limits.
- **T002** Expand typed input references into one native step and validate the result. Prove that defaults, explicit empty values, and literal arguments survive without running commands or changing Git state.

## Review evidence

Verify divergent checkout reads, partially invalid catalogs, duplicate identifiers, unknown references, and oversized or unsupported entries.

Acceptance coverage AC-02, AC-06.
