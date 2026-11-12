---
work_package_id: WP03
title: Dashboard header modal and layout cleanup
dependencies:
- WP01
- WP02
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
planning_base_branch: feat/dashboard-cleanup
merge_target_branch: feat/dashboard-cleanup
branch_strategy: Planning artifacts for this mission were generated on feat/dashboard-cleanup. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into feat/dashboard-cleanup unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
history: []
agent_profile: frontend-freddy
authoritative_surface: src/app/
create_intent:
- src/components/new-project-dialog.tsx
execution_mode: code_change
owned_files:
- src/app/page.tsx
- src/components/new-project-form.tsx
- src/components/new-project-dialog.tsx
- package.json
- package-lock.json
priority: P1
role: implementer
tags: []
tracker_refs: []
---

# WP03 — Dashboard header modal and layout cleanup

Read the [spec](../spec.md), [plan](../plan.md), and [interfaces](../contracts/dashboard.md) before implementation.

Use Workbox tokens and retain the compact snapshot presentation and readable count alternative. Opening or dismissing an unsubmitted dialog does not create a project. Follow the installed Next.js guidance before editing the page or components.

## Subtasks

- **T007** Remove the full project sidebar and render the shared seven-day snapshot, feed, summary, and Explore link.
- **T008** Add a header New Hubnot project trigger and a Radix Dialog with labeled fields, keyboard focus handling, and an explicit submit action.
- **T009** Render the shared public outcomes. Keep inputs on failure, guard pending submission, and show an Open project link on success. Verify desktop and narrow layouts and keyboard behavior.

## Review evidence

Record the observed outcomes and reproducible checks for this package before review.
