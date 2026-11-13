---
work_package_id: WP07
title: Cross-repo lifecycle and rollout verification
dependencies:
- WP03
- WP05
- WP06
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- FR-008
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
subtasks:
- T019
- T020
- T021
history: []
authoritative_surface: tests/
create_intent:
- tests/automatic-proposal-checks-journey.test.ts
- docs/automatic-proposal-checks.md
execution_mode: code_change
owned_files:
- tests/automatic-proposal-checks-journey.test.ts
- docs/automatic-proposal-checks.md
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP07 — Cross-repo lifecycle and rollout verification

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T019** Run production browser and MCP against the real Linux Hubnot runner and a synced second clone. Cover opens from browser and CLI, a synced revision, trigger changes via governance, and restart without a duplicate logical check.
- **T020** Verify the exact reviewed configuration, pinned definition and signed policy evidence through the journey. Run compatibility cases for an older Hubnot binary, no trigger file and unavailable runner.
- **T021** Record evidence and operator rollout and recovery instructions. Release the Hubnot capability before Workbox enables it. Reserve the full OS matrix for release qualification.

## Review evidence

Provide a reproducible journey, exact revisions and native result IDs, plus passing compatibility and parity checks.
