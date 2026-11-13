---
work_package_id: WP03
title: Integrate composition and signed submission
dependencies:
- WP02
requirement_refs:
- FR-001
- FR-003
- FR-006
planning_base_branch: codex/mdxeditor-upgrade
merge_target_branch: codex/mdxeditor-upgrade
branch_strategy: Planning artifacts for this mission were generated on codex/mdxeditor-upgrade. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/mdxeditor-upgrade unless the human explicitly redirects the landing branch.
subtasks:
- T006
- T007
- T008
history: []
authoritative_surface: src/
create_intent:
- tests/markdown-submission.test.ts
execution_mode: code_change
owned_files:
- src/components/create-form.tsx
- src/app/p/*/issues/issue-forms.tsx
- src/app/p/*/discussions/discussion-form.tsx
- src/app/p/*/proposals/page.tsx
- src/app/api/projects/*/proposals/route.ts
- tests/markdown-submission.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Integrate composition and signed submission

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T006** Wire issue descriptions and comments, discussion posts and replies, and the existing proposal description composer to the shared editor. Keep branch selection outside this package.
- **T007** Trace proposal description bytes into the native event. Remove trimming and verify the native exact publication and replay contract before selecting the existing submission seam.
- **T008** Verify unrelated title and label changes preserve the body, stale edits retain drafts, and uncertain submissions reuse the exact reviewed payload and operation ID. If Hubnot support is missing, record the native dependency and verify it before accepting the affected flow.

## Review evidence

Exercise form-to-signing paths with real Hubnot fixtures and compare signed bytes and operation identity.
