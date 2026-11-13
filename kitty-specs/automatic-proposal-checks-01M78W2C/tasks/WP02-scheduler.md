---
work_package_id: WP02
title: Hubnot observation and durable scheduling
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-007
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-automatic-proposal-checks-01M78W2C
base_commit: 0eb1ab1508ddd51806a96789f2f3498e18729168
created_at: '2026-11-13T04:48:35.815084+00:00'
subtasks:
- T004
- T005
- T006
history: []
authoritative_surface: tests/
create_intent:
- tests/automatic-checks-scheduling.test.ts
execution_mode: code_change
owned_files:
- tests/automatic-checks-scheduling.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Hubnot observation and durable scheduling

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T004** Implement in the Hubnot companion the single registered scheduling authority, persistent event decisions and check ledger, with opt-in and a coherent pre-sync historical baseline. Document registration, recovery and migration.
- **T005** Observe verified admitted proposal.open and proposal.revise events independently of Workbox. Compare predecessor and candidate heads, pin active configuration at first observation, and retain incomplete prerequisites for reconciliation.
- **T006** Make observation and scheduling atomic. Use shared claims, lease fencing and stable check and attempt IDs. Verify restart and replay, including late sync without using author timestamps.

## Review evidence

Run Hubnot and Workbox consumer fixtures for open, new revision, metadata-only events, historical exclusion, late sync, disabled intervals, concurrent observations, unavailable code and restart.

## Companion delivery

Deliver the native changes through the Hubnot companion mission. Record the exact Hubnot commit and native test evidence in the Workbox review. The Workbox lane validates the native contract against that build.
