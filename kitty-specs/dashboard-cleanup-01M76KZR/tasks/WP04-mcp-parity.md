---
work_package_id: WP04
title: MCP dashboard and creation parity verification
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
planning_base_branch: feat/dashboard-cleanup
merge_target_branch: feat/dashboard-cleanup
branch_strategy: Planning artifacts for this mission were generated on feat/dashboard-cleanup. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/dashboard-cleanup unless the human explicitly redirects the landing branch.
subtasks:
- T010
- T011
- T012
history: []
agent_profile: node-norris
authoritative_surface: mcp/
create_intent:
- tests/dashboard-parity.test.ts
execution_mode: code_change
owned_files:
- mcp/server.ts
- tests/dashboard-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — MCP dashboard and creation parity verification

Read the [spec](../spec.md), [plan](../plan.md), and [interfaces](../contracts/dashboard.md) before implementation.

Capture AC-01 through AC-05 evidence, including browser keyboard focus, dismissal, and narrow layout checks from WP03. Use an isolated loopback port and a disposable index. Full OS qualification is a release activity.

## Subtasks

- **T010** Expose workbox_dashboard with exact public JSON and a viewable PNG and workbox_create_project with the shared creation operation and public outcomes. Preserve existing MCP tool contracts.
- **T011** Drive the production browser routes and MCP stdio against disposable roots and indexes. Compare summary, feed, rows, ranking, source counts, coverage, and links across busy, empty, and incomplete fixtures.
- **T012** Verify equivalent successful creation and a signed founding issue, then exercise invalid input, duplicates, concurrent browser and MCP requests, and indexing recovery. Run focused tests, scoped lint, TypeScript, production build, and applicable legacy MCP regression checks.

## Review evidence

Record the observed outcomes and reproducible checks for this package before review.
