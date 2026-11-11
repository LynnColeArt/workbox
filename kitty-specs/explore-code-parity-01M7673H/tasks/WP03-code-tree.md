---
work_package_id: WP03
title: Pinned Code browser and Git metadata
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-005
- FR-008
- NFR-001
- NFR-002
planning_base_branch: feat/explore-code-parity
merge_target_branch: feat/explore-code-parity
branch_strategy: Planning artifacts for this mission were generated on feat/explore-code-parity. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/explore-code-parity unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
history: []
agent_profile: node-norris
authoritative_surface: src/lib/workbox/
create_intent: ["src/lib/workbox/code-browser.ts", "src/components/code-browser.tsx", "tests/code-browser.test.ts"]
execution_mode: code_change
owned_files:
- src/lib/workbox/repo.ts
- src/lib/workbox/code-browser.ts
- src/components/code-browser.tsx
- tests/code-browser.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Pinned Code browser and Git metadata

Use the [spec](../spec.md), [plan](../plan.md), and [read contract](../contracts/reads.md). Read AGENTS.md and the installed Next.js guides before touching application code. Keep changes within the owned paths and commit them on the feature branch.

Move existing Code presentation into the owned component as needed. Leave the actual page to WP05. Share branch selection with WP04. Expose readCode(db, projectId, query).

## Subtasks

- **T007** Resolve default and explicit branches to immutable commits.
- **T008** Read tree, last-change and exact commit details.
- **T009** Render the repository table and verify paths, dates and reachability.

## Verification

Run focused tests and scoped ESLint. Use disposable Git and SQLite fixtures. Verify public results against the contract. The final integration package owns the production build and cross-surface verification.
