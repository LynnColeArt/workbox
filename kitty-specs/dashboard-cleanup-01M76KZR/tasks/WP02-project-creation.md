---
work_package_id: WP02
title: Shared project creation and recovery
dependencies: []
requirement_refs:
- FR-003
- FR-004
- FR-006
planning_base_branch: feat/dashboard-cleanup
merge_target_branch: feat/dashboard-cleanup
branch_strategy: Planning artifacts for this mission were generated on feat/dashboard-cleanup. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/dashboard-cleanup unless the human explicitly redirects the landing branch.
subtasks:
- T004
- T005
- T006
history: []
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent:
- tests/dashboard-project-creation.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/create.ts
- src/lib/workbox/discover.ts
- src/app/api/projects/route.ts
- tests/dashboard-project-creation.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Shared project creation and recovery

Read the [spec](../spec.md), [plan](../plan.md), and [interfaces](../contracts/dashboard.md) before implementation.

Export public input, outcome, and recovery contracts for both HTTP and MCP. Use a disposable root and index. Treat existing empty directories and symlinks as conflicts. Record enough phase and ownership information to guard cleanup and recovery. Keep local paths, diagnostics, and private identity data inside the server.

## Subtasks

- **T004** Normalize and validate request fields in the shared creation operation. Route the existing HTTP POST through it and publish controlled results with a project URL and a founding issue reference.
- **T005** Claim the final directory exclusively, track the attempt privately, and keep unfinished initialization out of discovery. Preserve existing Git, Hubnot identity, governance, and signed founding issue behavior.
- **T006** Verify the indexed founding issue before success. For a known indexing failure, retain the signed repository and allow a matching explicit retry to index only. Test concurrent requests, preexisting paths, initialization failures, and interrupted or ambiguous attempts.

## Review evidence

Record the observed outcomes and reproducible checks for this package before review.
