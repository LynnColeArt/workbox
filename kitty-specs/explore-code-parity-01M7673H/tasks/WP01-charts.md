---
work_package_id: WP01
title: Shared chart model and visuals
dependencies: []
requirement_refs:
- FR-008
- FR-009
- NFR-001
planning_base_branch: feat/explore-code-parity
merge_target_branch: feat/explore-code-parity
branch_strategy: Planning artifacts for this mission were generated on feat/explore-code-parity. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/explore-code-parity unless the human explicitly redirects the landing branch.
subtasks:
- T001
- T002
- T003
history: []
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent: ["src/lib/workbox/activity-chart.ts", "src/lib/workbox/activity-chart-options.ts", "src/lib/workbox/activity-chart-svg.ts", "src/components/activity-chart.tsx", "tests/activity-chart.test.ts"]
execution_mode: code_change
owned_files:
- package.json
- package-lock.json
- src/lib/workbox/activity-chart.ts
- src/lib/workbox/activity-chart-options.ts
- src/lib/workbox/activity-chart-svg.ts
- src/components/activity-chart.tsx
- tests/activity-chart.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Shared chart model and visuals

Use the [spec](../spec.md), [plan](../plan.md), and [read contract](../contracts/reads.md). Read AGENTS.md and the installed Next.js guides before touching application code. Keep changes within the owned paths and commit them on the feature branch.

Use the shared API below. Add ECharts and Octicons locally. Chart visual and its data must reconcile, including unknown days and an active selection.

## Subtasks

- **T001** Define normalized chart and selection helpers.
- **T002** Render a browser chart and MCP-ready SVG from the same model.
- **T003** Verify visuals and keyboard-operable day links.

## Verification

Run focused tests and scoped ESLint. Use disposable Git and SQLite fixtures. Verify public results against the contract. The final integration package owns the production build and cross-surface verification.
