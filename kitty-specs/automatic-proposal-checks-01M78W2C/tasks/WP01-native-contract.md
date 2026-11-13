---
work_package_id: WP01
title: Hubnot trigger and evidence contracts
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-005
- FR-006
- FR-008
planning_base_branch: codex/automatic-proposal-checks
merge_target_branch: codex/automatic-proposal-checks
branch_strategy: Planning artifacts for this mission were generated on codex/automatic-proposal-checks. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into codex/automatic-proposal-checks unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-automatic-proposal-checks-01M78W2C
base_commit: 0eb1ab1508ddd51806a96789f2f3498e18729168
created_at: '2026-11-13T04:46:19.961331+00:00'
subtasks:
- T001
- T002
- T003
history: []
authoritative_surface: tests/
create_intent:
- docs/automatic-proposal-checks-contract.md
- tests/automatic-checks-contract.test.ts
execution_mode: code_change
owned_files:
- docs/automatic-proposal-checks-contract.md
- tests/automatic-checks-contract.test.ts
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP01 — Hubnot trigger and evidence contracts

Read the [specification](../spec.md) and [implementation plan](../plan.md).

## Subtasks

- **T001** Define the native capability, trigger configuration format and strict validator for the complete draft tree. Specify absent configuration, repeated keys or events, unknown events, and missing or removed pipelines.
- **T002** Define exact candidate, trusted definition, configuration source, check, attempt, and authority identities and their native read and evidence envelopes. Specify old-reader and old-binary behavior, including manual runs.
- **T003** Publish the Workbox consumer contract and fixtures against the companion Hubnot implementation. The Hubnot change owns the native schema and validator.

## Review evidence

Show versioned native command fixtures, exact canonical bytes and reproducible rejection cases. Include Go starter selection and capability absence.

## Companion delivery

Deliver the native changes through the Hubnot companion mission. Record the exact Hubnot commit and native test evidence in the Workbox review. The Workbox lane validates the native contract against that build.
