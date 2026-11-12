---
work_package_id: WP01
title: Repository details and workflow inventory
dependencies: []
requirement_refs: [FR-001, FR-002, FR-003]
planning_base_branch: feat/repo-settings
merge_target_branch: feat/repo-settings
branch_strategy: Land changes on feat/repo-settings.
subtasks:
- T001
- T002
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/settings-read.ts
- tests/settings-read.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/settings-read.ts
- src/lib/workbox/db.ts
- src/lib/workbox/queries.ts
- src/app/api/projects/[id]/description/route.ts
- tests/settings-read.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Repository details and workflow inventory

Read the [spec](../spec.md) and [plan](../plan.md).

## Subtasks

- **T001** Read and update project details through the existing local curation overlay with backwards-compatible migration.
- **T002** Read default-branch pipeline and policy files at the pinned commit, and separately expose native signed workflow inventory and controlled availability states.
