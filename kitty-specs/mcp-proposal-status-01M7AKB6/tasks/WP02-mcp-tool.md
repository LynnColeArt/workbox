---
work_package_id: WP02
title: Direct MCP proposal status lookup
dependencies:
- WP01
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
- T003
- T004
history: []
authoritative_surface: mcp/
create_intent:
- mcp/proposal-status.ts
- tests/mcp-proposal-status.test.ts
execution_mode: code_change
owned_files:
- mcp/server.ts
- mcp/proposal-status.ts
- tests/mcp-proposal-status.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---
# Direct MCP proposal status lookup

Read the [plan](../plan.md) and [specification](../spec.md).

- **T003** Register `workbox_proposal_status` with the existing structured MCP response path. Validate project, full signed ID, and exact or lineage mode before native reads. Default to exact.
- **T004** Use the shared resolver and projection. Return the requested and selected identities, exact Workbox links, policy state, and completeness. Return only visible choices for ambiguous lineages. Preserve full IDs and use stable safe errors without raw native messages or repository paths.

Review tool discovery, argument rejection, full ID preservation, canonical links, safe error handling, and compatibility with the existing proposal checks and repository activity tools.
