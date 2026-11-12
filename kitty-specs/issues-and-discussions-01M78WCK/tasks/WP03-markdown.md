---
work_package_id: WP03
title: Rich Markdown editor, preview and rendering
dependencies: []
requirement_refs:
- FR-004
- FR-005
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
subtasks:
- T006
- T007
- T008
owned_files:
- 'src/components/markdown-editor.tsx'
- 'src/lib/workbox/markdown.ts'
- 'src/app/api/markdown/route.ts'
- 'tests/markdown.test.ts'
- 'package.json'
- 'package-lock.json'
history: []
authoritative_surface: src/
create_intent:
- 'src/components/markdown-editor.tsx'
- 'src/lib/workbox/markdown.ts'
- 'src/app/api/markdown/route.ts'
- 'tests/markdown.test.ts'
execution_mode: code_change
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Rich Markdown editor, preview and rendering

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

Shared components, renderer, preview contract and focused tests.

## Subtasks

- **T006** Build a reusable keyboard-accessible Write and Preview composer with source editing and controls for headings, emphasis, links, lists, quotes and fenced code.
- **T007** Share rendering rules across preview, published views and the shared preview operation, with its MCP registration owned by WP02. Disable raw HTML execution, enforce safe link schemes, and preserve source bytes, including syntax outside the toolbar.
- **T008** Provide draft retention hooks for failed submissions and resource-specific editor integration. Keep the component reusable for the later proposal form.

## Review evidence

Verify toolbar selection and focus, keyboard use, hostile markup handling, preview agreement, and browser/MCP source round-trips.
