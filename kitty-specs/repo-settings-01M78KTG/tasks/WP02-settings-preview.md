---
work_package_id: WP02
title: Pipeline draft validation and preview
dependencies: []
requirement_refs:
- FR-004
planning_base_branch: feat/repo-settings
merge_target_branch: feat/repo-settings
branch_strategy: Planning artifacts for this mission were generated on feat/repo-settings. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/repo-settings unless the human explicitly redirects the landing branch.
subtasks:
- T003
- T004
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/settings-preview.ts
- tests/settings-preview.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/settings-preview.ts
- tests/settings-preview.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Pipeline draft validation and preview

Read the [spec](../spec.md) and [plan](../plan.md).

## Subtasks

- **T003** Validate the native pipeline contract in memory and return diagnostics without writes or execution.
- **T004** Bind preview to the exact base and draft bytes and test repository state before and after validation.
