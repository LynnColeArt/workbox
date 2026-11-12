---
work_package_id: WP07
title: End-to-end collaboration and parity verification
dependencies:
- WP04
- WP06
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
subtasks:
- T017
- T018
- T019
owned_files:
- 'tests/collaboration-journeys.test.ts'
history: []
authoritative_surface: tests/
create_intent:
- 'tests/collaboration-journeys.test.ts'
execution_mode: code_change
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP07 — End-to-end collaboration and parity verification

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

End-to-end fixtures and review evidence for browser, MCP and compatibility.

## Subtasks

- **T017** Run complete issue and discussion journeys from list to signed outcome in the browser and through MCP. Compare actions, identity, permissions, filters, pagination, Markdown and resulting state.
- **T018** Exercise old issue links and MCP tools, synced content, denial, stale and competing revisions, lost responses, and indexing recovery. Verify keyboard composition, focus and draft retention in the browser.
- **T019** Record focused checks and repository validation. Reserve full OS testing for release qualification.

## Review evidence

Show a contributor can complete both journeys entirely in Workbox and that equivalent MCP calls yield the same signed outcomes.
