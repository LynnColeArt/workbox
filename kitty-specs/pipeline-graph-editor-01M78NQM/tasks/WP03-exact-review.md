---
work_package_id: WP03
title: Exact diff and review binding
dependencies:
- WP02
requirement_refs:
- FR-007
- FR-008
- FR-009
planning_base_branch: feat/pipeline-graph-editor
merge_target_branch: feat/pipeline-graph-editor
branch_strategy: Planning artifacts for this mission were generated on feat/pipeline-graph-editor. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/pipeline-graph-editor unless the human explicitly redirects the landing branch.
subtasks:
- T006
- T007
- T008
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/lib/workbox/pipeline-review.ts
- tests/pipeline-review.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/pipeline-review.ts
- tests/pipeline-review.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Exact diff and review binding

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T006** Bind review to the exact pinned committed bytes, draft bytes and signer using the existing Settings preview. Detect stale base or signer and preserve the legacy preview contract.
- **T007** Return deterministic diff hunks and exact before and after text, including absence, line endings, missing final newline, and formatting-only changes. Bound diff work and expose partial results explicitly.
- **T008** Define the confirmed submission payload and retry contract around the existing Settings submit operation. Preserve the exact reviewed bytes and original operation ID after an uncertain response.

## Review evidence

Verify absent versus empty, reorder, whitespace, CRLF, Unicode, large diff fallback, stale review, and byte-for-byte candidate agreement.

Acceptance coverage AC-04, AC-05.
