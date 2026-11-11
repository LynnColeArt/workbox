# Explore and Code work packages

Planning target is `feat/explore-code-parity`. See [spec](spec.md), [plan](plan.md), and [read contract](contracts/reads.md).

## Work Package WP01 — Shared chart model and visuals (Priority: P1)

- **Prompt** [WP01-charts.md](tasks/WP01-charts.md)
- **Dependencies**: None

T001 Define normalized chart and selection helpers (WP01)
T002 Render a browser chart and MCP-ready SVG from the same model (WP01)
T003 Verify visuals and keyboard-operable day links (WP01)

## Work Package WP02 — Explore catalog and seven-day activity (Priority: P1)

- **Prompt** [WP02-explore.md](tasks/WP02-explore.md)
- **Dependencies**: WP01

T004 Collect qualifying Git and verified activity with coverage (WP02)
T005 Build and render the shared Explore catalog and drill-down (WP02)
T006 Verify distinct counts, search, pagination and stale selection (WP02)

## Work Package WP03 — Pinned Code browser and Git metadata (Priority: P1)

- **Prompt** [WP03-code-tree.md](tasks/WP03-code-tree.md)
- **Dependencies**: WP01

T007 Resolve default and explicit branches to immutable commits (WP03)
T008 Read tree, last-change and exact commit details (WP03)
T009 Render the repository table and verify paths, dates and reachability (WP03)

## Work Package WP04 — Repository activity calendar and records (Priority: P1)

- **Prompt** [WP04-repo-calendar.md](tasks/WP04-repo-calendar.md)
- **Dependencies**: WP01, WP03

T010 Collect the four calendar metrics with source scope (WP04)
T011 Render metric controls, calendar and paged daily records (WP04)
T012 Verify counts, visibility, missing history and stable links (WP04)

## Work Package WP05 — Integrate browser and MCP and verify parity (Priority: P1)

- **Prompt** [WP05-integration.md](tasks/WP05-integration.md)
- **Dependencies**: WP02, WP03, WP04

T013 Wire the Code page and publish equivalent MCP reads and images (WP05)
T014 Exercise browser and MCP against the same disposable fixture (WP05)
T015 Run focused checks, production build and regression verification (WP05)
