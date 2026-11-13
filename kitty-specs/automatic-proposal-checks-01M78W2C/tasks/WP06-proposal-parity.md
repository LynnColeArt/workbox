---
work_package_id: WP06
title: Revision checks in proposal detail and MCP
dependencies:
- WP03
- WP05
requirement_refs:
- FR-004
- FR-005
- FR-006
- FR-007
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
subtasks:
- T016
- T017
- T018
history: []
authoritative_surface: src/
create_intent:
- mcp/proposal-checks.ts
- tests/proposal-checks-parity.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/proposal-checks.ts
- src/components/proposal-checks.tsx
- src/lib/workbox/proposal-detail.ts
- src/app/p/*/proposals/*/**
- mcp/proposal-checks.ts
- mcp/server.ts
- tests/proposal-checks-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP06 — Revision checks in proposal detail and MCP

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T016** Extend the shared proposal checks view model and exact candidate selectors with native status, reason, pinned definition and configuration, timestamps, attempts and evidence.
- **T017** Render the same selected revision and available run details in proposal detail and MCP. Distinguish ineligible and unavailable from waiting, and preserve old revisions and signed evidence.
- **T018** If the native capability supports explicit retry, expose it on both surfaces with the same permissions and idempotent request. Keep each retry visible as a distinct attempt.

## Review evidence

Compare browser and MCP for pending, running, failed and completed checks, a non-authority clone, and older revisions. Verify status display never changes native merge policy.
