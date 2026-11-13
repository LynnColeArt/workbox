---
work_package_id: WP05
title: Settings browser and MCP trigger controls
dependencies:
- WP04
requirement_refs:
- FR-006
- FR-008
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-automatic-proposal-checks-01M78W2C
base_commit: 0eb1ab1508ddd51806a96789f2f3498e18729168
created_at: '2026-11-13T04:56:40.497515+00:00'
subtasks:
- T013
- T014
- T015
history: []
authoritative_surface: src/
create_intent:
- mcp/pipeline-triggers.ts
- tests/proposal-trigger-settings-parity.test.ts
execution_mode: code_change
owned_files:
- src/app/p/*/settings/**
- src/app/api/projects/*/settings/route.ts
- src/components/*pipeline*
- src/components/repo-settings.tsx
- mcp/pipeline-triggers.ts
- mcp/server.ts
- tests/proposal-trigger-settings-parity.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP05 — Settings browser and MCP trigger controls

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T013** Add independent Open and New revision toggles for each pipeline in Settings. Show the active rules and revision, validation diagnostics, exact review and explicit proposal submission.
- **T014** Expose the same read, draft, validation, review and submission actions through typed MCP tools backed by the shared operations. Keep Graph and JSON in the same draft.
- **T015** Verify both surfaces use the same permissions, diagnostics, diff, operation identity, stale recovery and absent capability. Include the Go starter test pipeline.

## Review evidence

Compare the native submission and response from the browser and MCP for the same draft. Verify read-only actions leave Git refs and scheduler state unchanged.
