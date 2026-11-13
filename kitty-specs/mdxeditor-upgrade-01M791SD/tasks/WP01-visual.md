---
work_package_id: WP01
title: Client-only Visual editor
dependencies: []
requirement_refs:
- FR-001
- FR-004
- FR-005
planning_base_branch: codex/mdxeditor-upgrade
merge_target_branch: codex/mdxeditor-upgrade
branch_strategy: Planning artifacts for this mission were generated on codex/mdxeditor-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/mdxeditor-upgrade unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-mdxeditor-upgrade-01M791SD
base_commit: 028738c4532d612b0aa0dc6133c62fd17ea159f1
created_at: '2026-11-13T02:51:11.742907+00:00'
subtasks:
- T001
- T002
history: []
authoritative_surface: src/
create_intent:
- src/components/markdown-visual-editor.tsx
- tests/markdown-visual.test.ts
execution_mode: code_change
owned_files:
- package.json
- package-lock.json
- src/components/markdown-visual-editor.tsx
- tests/markdown-visual.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Client-only Visual editor

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T001** Pin MDXEditor and verify its initialization, user change, programmatic replacement, and error callbacks in the production Next build.
- **T002** Implement the client-only Visual surface with keyboard controls for headings, emphasis, links, lists, quotes, tables, and fenced code. Validate pasted links and keep HTML and executable MDX inert.

## Review evidence

Demonstrate the production build and an interactive Visual session. Record the verified callback and serialization behavior for WP02.
