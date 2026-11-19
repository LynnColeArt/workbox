# Workbox development and acceptance

Scope: first-party development workflow, supported commands, and the acceptance contract for the Workbox repository. This document supersedes older repository guidance wherever it described the SQLite index as a collaboration authority, including prior `CODEX-BRIEF.md` revisions (updated in place to match).

## Authority model

1. **Git is the authority for object and ref history.** Durable facts are Git objects; signed collaboration events are anchored as commits under `refs/hn/actors/*` and `refs/hn/memory/*` (`src/lib/hn/gitread.ts`, `src/lib/workbox/read.ts`).
2. **Hubnot is the authority for signed collaboration facts.** The `hn` binary (`src/lib/hn/runner.ts`) is the canonical writer and reader for issues, discussions, proposals, checks, and memories. The indexer consults the Hubnot visibility snapshot and refuses indexing when it is unavailable (`src/lib/workbox/index.ts`).
3. **Workbox indexes are rebuildable.** The SQLite read model at `.workbox/index.db` (override with `WORKBOX_DB_PATH`; `src/lib/workbox/db.ts`) is a projection of Git. Delete it and re-index to rebuild. Reconciliation is retry-safe and wipes stale per-project projections (`src/lib/workbox/index.ts`). Events are re-verified at read time; cached verification results are never authoritative.
4. **GitHub is a migration source.** Imports flow through the migration surface as planned, confirmed, inspectable sessions (`src/lib/workbox/migrations.ts`, `src/components/migration-form.tsx`, page at `src/app/p/[id]/settings/migrations/page.tsx`). GitHub is not an authority for Workbox collaboration facts.

### Retired guidance

- The SQLite database is **not** a collaboration record, ledger, or authority. Earlier repository guidance - including `CODEX-BRIEF.md` revisions - said otherwise; treat any surviving text along those lines as superseded by this document. Signed collaboration facts live in Git under Hubnot refs and are readable without any local database (`tests/collaboration-native.test.ts` exercises a synced clone recovering signed evidence without a local scheduling ledger).
- GitHub is not a runtime collaboration authority for project state; it is a migration source with explicit provenance.

## Environment

| Variable | Used by | Meaning |
| --- | --- | --- |
| `WORKBOX_HN_BIN` | test suites (for example `tests/collaboration-native.test.ts`), `src/lib/hn/runner.ts` | Hubnot binary path. Native suites skip when it is unset and `/tmp/hn` is missing. |
| `WORKBOX_DB_PATH` | `src/lib/workbox/db.ts` consumers (for example `scripts/activity-proof.ts`) | Index database path; defaults to `.workbox/index.db`. |
| `WORKBOX_PROJECTS_ROOT` | `src/lib/workbox/discover.ts` | Projects root scanned for Hubnot repositories; default `<cwd>/projects`. Skip and naming overrides come from `workbox.registry.json`. |
| `WORKBOX_MARKDOWN_PARITY_TEST`, `WORKBOX_ISSUES_PARITY_TEST`, `WORKBOX_COLLABORATION_JOURNEYS_TEST` | parity suites | Enable the browser and MCP parity suites. |
| `WORKBOX_PLAYWRIGHT_MODULE`, `WORKBOX_CHROME_BIN` | browser parity suites | Headless browser used by the parity suites. |

Proposal comparison requires Git 2.39 or newer; the current baseline is validated with Git 2.39.5 and Node.js 24.20.0. Historical `.gitattributes` are read from the reviewed head tree in a private work tree with replacement objects disabled. If that historical attribute context cannot be built, comparison returns `unavailable` rather than reporting binary or zero statistics.

## Supported commands

These are commands supported by the pinned package scripts and test layout. Distinguish procedures from run evidence: a procedure is something a contributor can execute; evidence is a recorded result of actually running commands in a stated environment.

Build:

```sh
npm install
npm run build
```

`npm run build` is the production Next.js build used as the build and type check gate in recorded runs.

Focused Node test suites:

```sh
node --import tsx --test tests/index-reconciliation.test.ts
node --import tsx --test tests/collaboration-native.test.ts
```

Native suites require `WORKBOX_HN_BIN` pointing at a Hubnot binary and skip quietly when it (or `/tmp/hn`) is missing.

Full parity invocation reproduced from recorded evidence (`kitty-specs/mdxeditor-upgrade-01M791SD/research/implementation-verification.md`):

```sh
WORKBOX_MARKDOWN_PARITY_TEST=1 WORKBOX_ISSUES_PARITY_TEST=1 \
WORKBOX_COLLABORATION_JOURNEYS_TEST=1 WORKBOX_HN_BIN=/path/to/hn \
WORKBOX_PLAYWRIGHT_MODULE=/path/to/playwright-core WORKBOX_CHROME_BIN=/path/to/chrome \
node --import tsx --test tests/issues-parity.test.ts tests/discussions-parity.test.ts \
  tests/collaboration-journeys.test.ts tests/markdown*.test.ts
```

Operational procedures (not acceptance evidence):

- `bash scripts/mcp-selftest.sh` - MCP smoke procedure.
- `scripts/index.ts` - full re-index helper against the configured environment; run it through the tsx loader used by the test suites and see the script header for its inputs.
- `scripts/seed-demo.sh` and `scripts/seed-round2.sh` - drive the real `hn` CLI to seed a signed demo repository.
- Lint rules live in `eslint.config.mjs`; recorded runs apply lint to changed TypeScript files.

The pinned npm scripts are enumerated in `package.json`; the commands above are the ones relied on by recorded acceptance runs.

## Test map

- `tests/collaboration-native.test.ts` - native Hubnot contract: legacy signed history, replay and lost-response recovery, competing revisions and resolution, discussions with accepted answers; asserts denied actions leave refs unchanged.
- `tests/collaboration-service.test.ts`, `tests/collaboration-journeys.test.ts` - shared service and end-to-end journey coverage.
- `tests/index-reconciliation.test.ts` - index rebuild and reconciliation on disposable Git fixtures.
- `tests/dashboard-read.test.ts`, `tests/dashboard-parity.test.ts` - dashboard projection, rolling-window counts, and visual parity.
- `tests/issues-parity.test.ts`, `tests/discussions-parity.test.ts` - HTTP and MCP parity against a production server and real Hubnot.
- `tests/automatic-proposal-checks-journey.test.ts`, `tests/automatic-checks-contract.test.ts`, `tests/automatic-checks-scheduling.test.ts`, `tests/automatic-checks-evidence.test.ts`, `tests/proposal-checks.test.ts`, `tests/proposal-checks-parity.test.ts` - automatic proposal checks contract, scheduling, evidence, and parity.
- `tests/mcp-proposal-status.test.ts`, `tests/proposal-status-parity.test.ts` - proposal status selection, acceptance, and signed merge evidence.
- `tests/markdown*.test.ts` - Markdown pipeline, drafts, editors, visual safety, and exactness.
- `tests/pipeline-*.test.ts` - pipeline drafts, templates, review, and graph parity.
- `tests/settings-*.test.ts` - settings read, preview, candidate, submit, and parity.
- `tests/explore-read.test.ts`, `tests/explore-code-parity.test.ts`, `tests/code-browser.test.ts` - explore and code browser reads.

## Acceptance rules

- Documentation and code must agree; check Markdown links and cited paths against the exact candidate tree.
- Recorded evidence names the commands, environment, and outcome (for example `kitty-specs/automatic-proposal-checks-01M78W2C/research/implementation-verification.md` and `kitty-specs/mcp-proposal-status-01M7AKB6/research/implementation-verification.md`).
- Full operating-system qualification is a release activity, not a repository acceptance step; mission evidence in this repository consistently defers it.
- This documentation refresh is a documentation-only change and introduces no new run evidence.

## Migration boundaries

- Sessions move through plan, inspect, apply, and resume with an explicit confirmation token, per-record intents, findings, and progress counts (`src/components/migration-form.tsx`, `src/lib/workbox/migrations.ts`).
- Sources, destinations, and paths come from the migration catalog exposed by `src/app/api/projects/[id]/migrations/route.ts`; session inputs include Git refs, snapshot IDs, record kinds, and per-finding decisions.
- GitHub integration (`src/lib/workbox/github-pull-requests.ts`) supplies pull-request history as imported source data; it never writes signed collaboration events.

## Path checklist (verified against the pinned tree)

All paths cited across this document and the README exist in the pinned candidate, including: `src/lib/workbox/db.ts`, `src/lib/workbox/index.ts`, `src/lib/workbox/discover.ts`, `src/lib/workbox/migrations.ts`, `src/lib/workbox/read.ts`, `src/lib/workbox/github-pull-requests.ts`, `src/lib/hn/gitread.ts`, `src/lib/hn/runner.ts`, `src/lib/hn/verifier.ts`, `src/components/migration-form.tsx`, `scripts/index.ts`, `scripts/activity-proof.ts`, `scripts/seed-demo.sh`, `scripts/seed-round2.sh`, `scripts/mcp-selftest.sh`, `tests/collaboration-native.test.ts`, `tests/index-reconciliation.test.ts`, `workbox.registry.json`, `eslint.config.mjs`, `package.json`, `AGENTS.md`, and the documents under `docs/`.
