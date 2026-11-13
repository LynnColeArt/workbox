# Direct MCP proposal status work packages

Target branch `codex/mcp-proposal-status`. See the [specification](spec.md) and [implementation plan](plan.md).

## Work Package WP01 — Shared Workbox revision and policy projection (Priority: P1)

- **Prompt** [WP01-shared-status.md](tasks/WP01-shared-status.md)
- **Dependencies**: None

- [ ] T001 Share the browser's revision labels and live-candidate counting while preserving exact and lineage selection. (WP01)
- [ ] T002 Project merge state, visible signed evidence, policy blockers, and decision deficits through shared Workbox logic. Preserve unknown evaluation and lineage conflicts. (WP01)

## Work Package WP02 — Direct MCP proposal status lookup (Priority: P1)

- **Prompt** [WP02-mcp-tool.md](tasks/WP02-mcp-tool.md)
- **Dependencies**: WP01

- [ ] T003 Register the read-only tool and validate project, full revision ID, and lookup mode. (WP02)
- [ ] T004 Return selected revision, visible choices, or safe unavailable results with full IDs and canonical links. (WP02)

## Work Package WP03 — Browser and MCP parity verification (Priority: P1)

- **Prompt** [WP03-parity.md](tasks/WP03-parity.md)
- **Dependencies**: WP02

- [ ] T005 Compare the production browser and MCP responses across a failed required check, a passing successor, and a signed merge. (WP03)
- [ ] T006 Verify ambiguous and incomplete lineages, optional failures, unavailable native evaluation, and read-only behavior. (WP03)
