---
work_package_id: WP03
title: Browser and MCP parity verification
dependencies:
- WP02
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
planning_base_branch: codex/mcp-proposal-status
merge_target_branch: codex/mcp-proposal-status
branch_strategy: Planning artifacts for this mission were generated on codex/mcp-proposal-status. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/mcp-proposal-status unless the human explicitly redirects the landing branch.
subtasks:
- T005
- T006
history: []
authoritative_surface: tests/
create_intent:
- tests/proposal-status-parity.test.ts
execution_mode: code_change
owned_files:
- tests/proposal-status-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---
# Browser and MCP parity verification

Read the [plan](../plan.md) and [specification](../spec.md).

- **T005** Use a self-contained Hubnot repository with the production Workbox browser surface and real MCP stdio. Verify the failed required README check, passing successor before acceptance, and signed merge. Compare exact IDs, blockers, acceptance deficits, merge evidence, and exact links. Confirm the old revision retains its own evidence.
- **T006** Cover exact and lineage modes, ambiguous visible choices, incomplete or unavailable native status, inaccessible candidates, invalid inputs, and optional failed checks. Check refs, index, and worktree around the reads.

Record the production build, TypeScript check, focused proposal regressions, and paired results. Reserve the full OS matrix for release qualification.
