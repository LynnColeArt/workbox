---
work_package_id: WP04
title: Repository activity calendar and records
dependencies:
- WP01
- WP03
requirement_refs:
- FR-006
- FR-007
- FR-008
- FR-009
- NFR-002
planning_base_branch: feat/explore-code-parity
merge_target_branch: feat/explore-code-parity
branch_strategy: Planning artifacts for this mission were generated on feat/explore-code-parity. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/explore-code-parity unless the human explicitly redirects the landing branch.
subtasks:
- T010
- T011
- T012
history: []
agent_profile: frontend-freddy
authoritative_surface: src/lib/workbox/
create_intent: ["src/lib/workbox/repository-activity.ts", "src/components/repository-activity.tsx", "tests/repository-activity.test.ts"]
execution_mode: code_change
owned_files:
- src/lib/workbox/repository-activity.ts
- src/components/repository-activity.tsx
- tests/repository-activity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Repository activity calendar and records

Use the [spec](../spec.md), [plan](../plan.md), and [read contract](../contracts/reads.md). Read AGENTS.md and the installed Next.js guides before touching application code. Keep changes within the owned paths and commit them on the feature branch.

Use verified SQLite events and the Git default-branch resolver from WP03. Expose readRepositoryActivity(db, projectId, query, now?). WP05 owns the page and MCP wiring.

## Subtasks

- **T010** Collect the four calendar metrics with source scope.
- **T011** Render metric controls, calendar and paged daily records.
- **T012** Verify counts, visibility, missing history and stable links.

## Verification

Run focused tests and scoped ESLint. Use disposable Git and SQLite fixtures. Verify public results against the contract. The final integration package owns the production build and cross-surface verification.
