---
work_package_id: WP05
title: Integrate browser and MCP and verify parity
dependencies:
- WP02
- WP03
- WP04
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- FR-008
- FR-009
- NFR-001
- NFR-002
planning_base_branch: feat/explore-code-parity
merge_target_branch: feat/explore-code-parity
branch_strategy: Planning artifacts for this mission were generated on feat/explore-code-parity. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/explore-code-parity unless the human explicitly redirects the landing branch.
subtasks:
- T013
- T014
- T015
history: []
agent_profile: node-norris
authoritative_surface: mcp/
create_intent: ["tests/explore-code-parity.test.ts"]
execution_mode: code_change
owned_files:
- src/app/p/[[]id]/code/page.tsx
- mcp/server.ts
- tests/explore-code-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP05 — Integrate browser and MCP and verify parity

Use the [spec](../spec.md), [plan](../plan.md), and [read contract](../contracts/reads.md). Read AGENTS.md and the installed Next.js guides before touching application code. Keep changes within the owned paths and commit them on the feature branch.

Retain the existing Code sidebar and established links. Verify parity from the actual MCP stdio protocol and browser routes. Preserve the legacy sanitizer and tool response shapes.

## Subtasks

- **T013** Wire the Code page and publish equivalent MCP reads and images.
- **T014** Exercise browser and MCP against the same disposable fixture.
- **T015** Run focused checks, production build and regression verification.

## Verification

Run focused tests and scoped ESLint. Use disposable Git and SQLite fixtures. Verify public results against the contract. The final integration package owns the production build and cross-surface verification.
