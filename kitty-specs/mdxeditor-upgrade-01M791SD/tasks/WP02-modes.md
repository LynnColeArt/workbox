---
work_package_id: WP02
title: Exact source across Visual, Source and Preview
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-006
planning_base_branch: codex/mdxeditor-upgrade
merge_target_branch: codex/mdxeditor-upgrade
branch_strategy: Planning artifacts for this mission were generated on codex/mdxeditor-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/mdxeditor-upgrade unless the human explicitly redirects the landing branch.
subtasks:
- T003
- T004
- T005
history: []
authoritative_surface: src/
create_intent:
- src/lib/workbox/markdown-draft.ts
- tests/markdown-draft.test.ts
execution_mode: code_change
owned_files:
- src/components/markdown-editor.tsx
- src/lib/workbox/markdown-draft.ts
- tests/markdown.test.ts
- tests/markdown-draft.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP02 — Exact source across Visual, Source and Preview

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T003** Start supported drafts in Visual. Keep the form-owned source authoritative through mode switches, initialization, stale callbacks, and programmatic replacement. Preserve focus, disabled state, and raw source editing.
- **T004** Distinguish deliberate visual edits from import normalization. Require explicit source review before publishing a candidate with unrelated changes. Fall back to Source on unsupported or unsafe imports with original bytes intact.
- **T005** Retain the current Preview path and ignore stale preview responses. Verify no-op switching with mixed line endings, Unicode, whitespace, code fences, and absent final newline.

## Review evidence

Show that source and preview use the same exact draft. Exercise failed Visual imports, source correction, candidate review, and reopening existing content.
