---
work_package_id: WP04
title: Shared Settings trigger drafts and exact submission
dependencies:
- WP01
requirement_refs:
- FR-002
- FR-006
- FR-008
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
subtasks:
- T010
- T011
- T012
history: []
authoritative_surface: src/
create_intent:
- src/lib/workbox/proposal-trigger-settings.ts
- tests/proposal-trigger-settings.test.ts
execution_mode: code_change
owned_files:
- src/lib/workbox/settings-operations.ts
- src/lib/workbox/settings-read.ts
- src/lib/workbox/pipeline-draft.ts
- src/lib/workbox/pipeline-review.ts
- src/lib/workbox/settings-candidate.ts
- src/lib/workbox/settings-submit.ts
- src/lib/workbox/proposal-trigger-settings.ts
- tests/proposal-trigger-settings.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP04 — Shared Settings trigger drafts and exact submission

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T010** Consume native capability and active configuration with source revision. Extend the shared draft to carry trigger toggles alongside Graph and JSON pipeline edits.
- **T011** Validate the complete proposed tree through Hubnot. Return matching diagnostics, exact bytes and multi-file diff without writing refs, durable draft state or scheduling state.
- **T012** Extend governed submission with authorization, reviewed base and actor checks, and the existing immutable operation key. Preserve a draft across stale or uncertain results.

## Review evidence

Exercise missing capability, stale reviewed base, allowed and denied callers, combined pipeline and trigger edits, exact bytes and lost-response replay.
