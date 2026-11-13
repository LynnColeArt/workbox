---
work_package_id: WP06
title: Discussion editing, moderation and conflict resolution
dependencies:
- WP05
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
subtasks:
- T015
- T016
owned_files:
- 'src/app/p/[[]id]/discussions/**'
- 'src/app/api/projects/[id]/discussions/route.ts'
- 'src/lib/workbox/discussions.ts'
- 'mcp/discussions.ts'
- 'tests/discussions-parity.test.ts'
history: []
authoritative_surface: src/
create_intent:
- 'src/app/api/projects/[id]/discussions/route.ts'
- 'src/lib/workbox/discussions.ts'
- 'mcp/discussions.ts'
- 'tests/discussions-parity.test.ts'
execution_mode: code_change
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP06 — Discussion editing, moderation and conflict resolution

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

Discussion detail actions, shared service extensions and parity fixtures.

## Subtasks

- **T015** Add permitted post and reply edits, category changes, close and reopen, and marking and clearing an accepted answer in browser and MCP.
- **T016** Pin answers to the exact reviewed reply revision. Handle stale thread or reply edits and authorized conflict resolution without losing draft text.

## Review evidence

Verify both transports enforce author and maintainer permissions. Edit an accepted reply and show the accepted answer still refers to the original revision.
