# Repository Settings work packages

Planning target `feat/repo-settings`. See the [spec](spec.md) and [plan](plan.md).

## Work Package WP01 — Repository details and workflow inventory (Priority: P1)

- **Prompt** [WP01-settings-read.md](tasks/WP01-settings-read.md)
- **Dependencies**: None

T001 Read and update project details through the existing local curation overlay with backwards-compatible migration. (WP01)
T002 Read default-branch pipeline and policy files at the pinned commit, and separately expose native signed workflow inventory and controlled availability states. (WP01)

## Work Package WP02 — Pipeline draft validation and preview (Priority: P1)

- **Prompt** [WP02-settings-preview.md](tasks/WP02-settings-preview.md)
- **Dependencies**: None

T003 Validate the native pipeline contract in memory and return diagnostics without writes or execution. (WP02)
T004 Bind preview to the exact base and draft bytes and test repository state before and after validation. (WP02)

## Work Package WP03 — Native proposal publication and recovery (Priority: P1)

- **Prompt** [WP03-settings-submit.md](tasks/WP03-settings-submit.md)
- **Dependencies**: WP01, WP02

T005 Verify signer pinning and idempotent native publication and recovery against a compatible binary. (WP03)
T006 Bind the exact proposal intent, confirm stale and unauthorized inputs append nothing, and verify interruption and concurrent retry behavior. (WP03)

## Work Package WP04 — Settings browser and MCP parity (Priority: P1)

- **Prompt** [WP04-settings-parity.md](tasks/WP04-settings-parity.md)
- **Dependencies**: WP01, WP02

T007 Expose common settings, update, validation and submission operations through browser routes and MCP. (WP04)
T008 Render the Settings tab, retained draft and exact preview, including clear submission availability and outcomes. (WP04)
T009 Verify browser and MCP parity and production build. Full OS qualification is reserved for release. (WP04)
