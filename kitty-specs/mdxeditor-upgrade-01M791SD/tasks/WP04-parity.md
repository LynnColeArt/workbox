---
work_package_id: WP04
title: Production browser and MCP preview parity
dependencies:
- WP03
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
planning_base_branch: codex/mdxeditor-upgrade
merge_target_branch: codex/mdxeditor-upgrade
branch_strategy: Planning artifacts for this mission were generated on codex/mdxeditor-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/mdxeditor-upgrade unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-mdxeditor-upgrade-01M791SD
base_commit: 028738c4532d612b0aa0dc6133c62fd17ea159f1
created_at: '2026-11-13T03:00:05.408607+00:00'
subtasks:
- T009
- T010
- T011
history: []
authoritative_surface: tests/
create_intent:
- tests/markdown-editor-parity.test.ts
execution_mode: code_change
owned_files:
- tests/markdown-editor-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Production browser and MCP preview parity

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T009** Compare production browser Preview, MCP preview and published rendering for identical input, including code, tables, Unicode, raw HTML, unsafe links, and inert MDX.
- **T010** Run keyboard and focus checks in the browser and complete exact-source mode switching, Source fallback, source review before signing, stale drafts, and lost-response replay. Verify mode switches leave Git refs unchanged.
- **T011** Record the production build, focused regression tests and acceptance evidence. Reserve full OS testing for release qualification.

## Review evidence

Verify identical HTML and source across transports and prove that only one signed event exists after retry.
