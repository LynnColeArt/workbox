---
work_package_id: WP01
title: Shared Workbox revision and policy projection
dependencies: []
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
planning_base_branch: codex/mcp-proposal-status
merge_target_branch: codex/mcp-proposal-status
branch_strategy: Planning artifacts for this mission were generated on codex/mcp-proposal-status. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/mcp-proposal-status unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-mcp-proposal-status-01M7AKB6
base_commit: 47ef48ca9c7363581714753178547add5a753483
created_at: '2026-11-13T14:07:39.624265+00:00'
subtasks:
- T001
- T002
history: []
authoritative_surface: src/
create_intent:
- src/lib/workbox/proposal-status.ts
- tests/proposal-status.test.ts
execution_mode: code_change
owned_files:
- src/components/proposal-detail-header.tsx
- src/lib/workbox/proposal-detail.ts
- src/lib/workbox/proposal-checks.ts
- src/lib/workbox/proposal-status.ts
- tests/proposal-status.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---
# Shared Workbox revision and policy projection

Read the [plan](../plan.md) and [specification](../spec.md).

- **T001** Reuse the native-backed revision resolver and extract the header's revision labeling into a shared projection. Keep exact lookups pinned to their requested revision and preserve lineage choices, visibility, and incomplete history.
- **T002** Reuse the Checks model to expose evidence requirements and blockers. Keep maintainer acceptance deficits and lineage restrictions distinct. Expose merge evidence only for the selected candidate when the native reader verifies visibility and binding. Represent recorded merge and merge conflict independently. Unknown evaluation has null blockers.

Review using the existing lineage, checks, and reader fixtures plus projection tests for evidence visibility, conflicts, and unavailable status. Confirm browser labels stay consistent.
