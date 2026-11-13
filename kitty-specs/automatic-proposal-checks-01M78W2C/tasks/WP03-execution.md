---
work_package_id: WP03
title: Hubnot isolated execution and trusted policy evidence
dependencies:
- WP02
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
- FR-007
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-automatic-proposal-checks-01M78W2C
base_commit: 0eb1ab1508ddd51806a96789f2f3498e18729168
created_at: '2026-11-13T04:53:16.042708+00:00'
subtasks:
- T007
- T008
- T009
history: []
authoritative_surface: tests/
create_intent:
- tests/automatic-checks-evidence.test.ts
execution_mode: code_change
owned_files:
- tests/automatic-checks-evidence.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Hubnot isolated execution and trusted policy evidence

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T007** In Hubnot, connect claimed attempts to the existing runner. Check explicit opt-in, runner authorization and actual Linux isolation availability. Report blocked prerequisites and keep the automatic path free of host fallback.
- **T008** Load the pinned trusted definition independently from the exact candidate workspace. Bind signed evidence to request, pipeline, candidate, definition and attempt. Reconcile ambiguous publication by operation identity before continuing.
- **T009** Integrate automatic evidence with both policy status and merge authorization. Keep manual request semantics and existing policy thresholds. Publish native status and history for consumers, including interrupted or canceled attempts where applicable.

## Review evidence

Verify an active definition is used even if the candidate changes it, and that old, unsigned or unauthorized results cannot satisfy policy. Verify recovery after signed publication and a Linux run of the Go starter.

## Companion delivery

Deliver the native changes through the Hubnot companion mission. Record the exact Hubnot commit and native test evidence in the Workbox review. The Workbox lane validates the native contract against that build.
