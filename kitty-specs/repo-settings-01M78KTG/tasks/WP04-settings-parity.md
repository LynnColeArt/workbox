---
work_package_id: WP04
title: Settings browser and MCP parity
dependencies:
- WP01
- WP02
requirement_refs:
- FR-001
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
planning_base_branch: feat/repo-settings
merge_target_branch: feat/repo-settings
branch_strategy: Planning artifacts for this mission were generated on feat/repo-settings. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/repo-settings unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/settings-operations.ts
- src/app/p/[id]/settings/page.tsx
- src/app/api/projects/[id]/settings/route.ts
- src/components/repo-settings.tsx
- tests/settings-parity.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/settings-operations.ts
- src/app/p/[id]/ci/page.tsx
- src/app/p/[id]/layout.tsx
- src/app/p/[id]/settings/page.tsx
- src/app/api/projects/[id]/settings/route.ts
- src/components/repo-settings.tsx
- mcp/server.ts
- tests/settings-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Settings browser and MCP parity

Read the [spec](../spec.md) and [plan](../plan.md).

## Subtasks

- **T007** Expose common settings, update, validation and submission operations through browser routes and MCP.
- **T008** Render the Settings tab, retained draft and exact preview, including clear submission availability and outcomes.
- **T009** Verify browser and MCP parity and production build. Full OS qualification is reserved for release.

Publication parity is pending WP03. The transport integration test covers reads, curation, no-write preview, stale inputs and the controlled unavailable result through both surfaces.
