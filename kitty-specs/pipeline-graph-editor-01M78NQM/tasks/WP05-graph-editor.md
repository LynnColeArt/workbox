---
work_package_id: WP05
title: Settings Graph, JSON and Review tabs
dependencies:
- WP04
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-005
- FR-006
- FR-007
- FR-008
planning_base_branch: feat/pipeline-graph-editor
merge_target_branch: feat/pipeline-graph-editor
branch_strategy: Planning artifacts for this mission were generated on feat/pipeline-graph-editor. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/pipeline-graph-editor unless the human explicitly redirects the landing branch.
subtasks:
- T011
- T012
- T013
history: []
agent_profile: node-norris
authoritative_surface: src/
create_intent:
- src/components/pipeline-graph-editor.tsx
execution_mode: code_change
owned_files:
- src/components/repo-settings.tsx
- src/components/pipeline-graph-editor.tsx
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP05 — Settings Graph, JSON and Review tabs

Read the [specification](../spec.md) and [plan](../plan.md).

## Subtasks

- **T011** Build the ordered graph with connectors and a step inspector. Provide keyboard-operable tab, node, argument and reorder controls with predictable focus.
- **T012** Wire template expansion and Graph and JSON operations to the shared draft. Preserve the exact source, show stale projection diagnostics, and ignore out-of-order responses.
- **T013** Show the shared diff with exact text access and explicit confirmation. Freeze the submitted attempt so an uncertain result can retry independently of later draft edits or refreshes.

## Review evidence

Exercise keyboard-only edits, template inputs, invalid JSON recovery, exact review, and retained submission attempts with the browser.

Acceptance coverage AC-01, AC-02, AC-03, AC-04, AC-05, AC-06.
