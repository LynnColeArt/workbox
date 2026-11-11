---
work_package_id: WP02
title: Explore catalog and seven-day activity
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-008
- FR-009
- NFR-002
planning_base_branch: feat/explore-code-parity
merge_target_branch: feat/explore-code-parity
branch_strategy: Planning artifacts for this mission were generated on feat/explore-code-parity. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/explore-code-parity unless the human explicitly redirects the landing branch.
subtasks:
- T004
- T005
- T006
history: []
agent_profile: frontend-freddy
authoritative_surface: src/app/
create_intent: ["src/lib/workbox/explore.ts", "tests/explore-read.test.ts"]
execution_mode: code_change
owned_files:
- src/app/explore/page.tsx
- src/lib/workbox/activity.ts
- src/lib/workbox/explore.ts
- tests/explore-read.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Explore catalog and seven-day activity

Use the [spec](../spec.md), [plan](../plan.md), and [read contract](../contracts/reads.md). Read AGENTS.md and the installed Next.js guides before touching application code. Keep changes within the owned paths and commit them on the feature branch.

Preserve the existing Dashboard activity helper contracts. Run one Git activity traversal per project per Explore result. Expose readExplore(db, query, now?) for MCP.

## Subtasks

- **T004** Collect qualifying Git and verified activity with coverage.
- **T005** Build and render the shared Explore catalog and drill-down.
- **T006** Verify distinct counts, search, pagination and stale selection.

## Verification

Run focused tests and scoped ESLint. Use disposable Git and SQLite fixtures. Verify public results against the contract. The final integration package owns the production build and cross-surface verification.
