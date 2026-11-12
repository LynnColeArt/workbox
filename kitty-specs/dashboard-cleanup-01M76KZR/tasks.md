# Dashboard cleanup work packages

**Planning target** `feat/dashboard-cleanup`

See the [spec](spec.md), [implementation plan](plan.md), and [browser and MCP contract](contracts/dashboard.md). WP01 and WP02 can proceed independently. WP03 consumes their interfaces. WP04 verifies both public surfaces together.

## Work Package WP01 — Shared dashboard read and seven-day visual (Priority: P1)

- **Prompt** [WP01-dashboard-snapshot.md](tasks/WP01-dashboard-snapshot.md)
- **Dependencies**: None

T001 Extract a public dashboard read with one reporting time, a consistent SQLite read snapshot, and bounded Git and verified Hubnot activity. (WP01)
T002 Preserve the rolling seven-day window, top-ten ranking, source counts, summary, twelve-entry feed, and project and Explore links. Carry per-source and aggregate coverage into the result. (WP01)
T003 Derive the browser visual model and locally rendered MCP PNG from the same ranked rows, scale, window, and coverage. Verify known zero, quiet and incomplete cases. (WP01)

## Work Package WP02 — Shared project creation and recovery (Priority: P1)

- **Prompt** [WP02-project-creation.md](tasks/WP02-project-creation.md)
- **Dependencies**: None

T004 Normalize and validate request fields in the shared creation operation. Route the existing HTTP POST through it and publish controlled results with a project URL and a founding issue reference. (WP02)
T005 Claim the final directory exclusively, track the attempt privately, and keep unfinished initialization out of discovery. Preserve existing Git, Hubnot identity, governance, and signed founding issue behavior. (WP02)
T006 Verify the indexed founding issue before success. For a known indexing failure, retain the signed repository and allow a matching explicit retry to index only. Test concurrent requests, preexisting paths, initialization failures, and interrupted or ambiguous attempts. (WP02)

## Work Package WP03 — Dashboard header modal and layout cleanup (Priority: P1)

- **Prompt** [WP03-dashboard-modal.md](tasks/WP03-dashboard-modal.md)
- **Dependencies**: WP01, WP02

T007 Remove the full project sidebar and render the shared seven-day snapshot, feed, summary, and Explore link. (WP03)
T008 Add a header New Hubnot project trigger and a Radix Dialog with labeled fields, keyboard focus handling, and an explicit submit action. (WP03)
T009 Render the shared public outcomes. Keep inputs on failure, guard pending submission, and show an Open project link on success. Verify desktop and narrow layouts and keyboard behavior. (WP03)

## Work Package WP04 — MCP dashboard and creation parity verification (Priority: P1)

- **Prompt** [WP04-mcp-parity.md](tasks/WP04-mcp-parity.md)
- **Dependencies**: WP01, WP02, WP03

T010 Expose workbox_dashboard with exact public JSON and a viewable PNG and workbox_create_project with the shared creation operation and public outcomes. Preserve existing MCP tool contracts. (WP04)
T011 Drive the production browser routes and MCP stdio against disposable roots and indexes. Compare summary, feed, rows, ranking, source counts, coverage, and links across busy, empty, and incomplete fixtures. (WP04)
T012 Verify equivalent successful creation and a signed founding issue, then exercise invalid input, duplicates, concurrent browser and MCP requests, and indexing recovery. Run focused tests, scoped lint, TypeScript, production build, and applicable legacy MCP regression checks. (WP04)
