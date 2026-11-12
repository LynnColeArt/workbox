---
work_package_id: WP01
title: Shared dashboard read and seven-day visual
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-005
planning_base_branch: feat/dashboard-cleanup
merge_target_branch: feat/dashboard-cleanup
branch_strategy: Planning artifacts for this mission were generated on feat/dashboard-cleanup. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/dashboard-cleanup unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
history: []
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent:
- src/lib/workbox/dashboard.ts
- src/lib/workbox/dashboard-chart.ts
- tests/dashboard-read.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/activity.ts
- src/lib/workbox/dashboard.ts
- src/lib/workbox/dashboard-chart.ts
- tests/dashboard-read.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Shared dashboard read and seven-day visual

Read the [spec](../spec.md), [plan](../plan.md), and [interfaces](../contracts/dashboard.md) before implementation.

Keep the existing Explore reader and activity callers compatible. Export the shared read and PNG renderer for WP03 and WP04. Test the unchanged ranking when latest activity predates the window, stable tie-breaking, coverage, and source count agreement.

## Subtasks

- **T001** Extract a public dashboard read with one reporting time, a consistent SQLite read snapshot, and bounded Git and verified Hubnot activity.
- **T002** Preserve the rolling seven-day window, top-ten ranking, source counts, summary, twelve-entry feed, and project and Explore links. Carry per-source and aggregate coverage into the result.
- **T003** Derive the browser visual model and locally rendered MCP PNG from the same ranked rows, scale, window, and coverage. Verify known zero, quiet and incomplete cases.

## Review evidence

Record the observed outcomes and reproducible checks for this package before review.
