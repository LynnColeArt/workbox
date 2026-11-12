---
work_package_id: WP03
title: Native proposal publication and recovery
dependencies: [WP01, WP02]
requirement_refs: [FR-005, FR-006]
planning_base_branch: feat/repo-settings
merge_target_branch: feat/repo-settings
branch_strategy: Land changes on feat/repo-settings.
subtasks:
- T005
- T006
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/settings-submit.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/settings-submit.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Native proposal publication and recovery

Read the [spec](../spec.md) and [plan](../plan.md).

## Subtasks

- **T005** Verify signer pinning and idempotent native publication and recovery against a compatible binary.
- **T006** Bind the exact proposal intent, confirm stale and unauthorized inputs append nothing, and verify interruption and concurrent retry behavior.
