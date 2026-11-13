---
work_package_id: WP01
title: Verify Hubnot collaboration contracts
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
planning_base_branch: codex/issues-and-discussions
merge_target_branch: codex/issues-and-discussions
branch_strategy: Planning artifacts for this mission were generated on codex/issues-and-discussions. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/issues-and-discussions unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-issues-and-discussions-01M78WCK
base_commit: f6bc7bab25ba173b706c13d9c71a705435759c29
created_at: '2026-11-12T22:33:13.582845+00:00'
subtasks:
- T001
- T002
history: []
authoritative_surface: tests/
create_intent:
- tests/collaboration-native.test.ts
execution_mode: code_change
owned_files:
- tests/collaboration-native.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Verify Hubnot collaboration contracts

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Ownership

Hubnot command fixtures, compatibility notes, and native adapter contract.

## Subtasks

- **T001** Inventory native issue and discussion reads, actor permissions, supported mutations, expected heads, and operation replay across installed and supported Hubnot versions. Identify any native changes required by the spec and establish their delivery dependency.
- **T002** Exercise legacy, synced, signed, stale, denied, and competing-head fixtures. Confirm thread and reply identity, exact accepted answer revisions, and how to recover a signed outcome after a lost response.

## Review evidence

Record command results and expected envelopes. Demonstrate that any capability gap is explicitly assigned to a native dependency or surfaced according to the specification.
