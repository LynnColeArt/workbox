# CODEX brief - Workbox

This brief states the authority contract and standing guardrails for agents working in the Workbox repository.

Supersedes earlier revisions: previous versions of this brief described the SQLite database (`.workbox/index.db`) as a collaboration record and as an authority for collaboration history. **That guidance is retired.** The index is a rebuildable read-model cache; authority lives in Git and Hubnot as described below. Where older notes or briefs say otherwise, this brief wins.

## Authority contract

1. **Git is the authority for object and ref history.** Durable facts are Git objects, signed collaboration events are anchored under `refs/hn/actors/*` and `refs/hn/memory/*` (`src/lib/hn/gitread.ts`), and denied or failed operations must leave refs unchanged (`tests/collaboration-native.test.ts` asserts this).
2. **Hubnot is the authority for signed collaboration facts.** Issue, discussion, proposal, check, and memory writes go through the `hn` binary (`src/lib/hn/runner.ts`; `WORKBOX_HN_BIN` in tests) and become signed Git events. Workbox code never fabricates or silently mutates collaboration state.
3. **The Workbox index is rebuildable.** `src/lib/workbox/db.ts` and `src/lib/workbox/index.ts` project verified events into SQLite for serving. The database can be deleted and rebuilt from Git at any time; no code path may require the index to persist a fact, and a cached row's verification state is never trusted second-hand (verification is per event, at read time).
4. **GitHub is a migration source.** GitHub history is imported through the migration surface (`src/lib/workbox/migrations.ts`, `src/components/migration-form.tsx`) as session-tracked, reviewed imports with explicit provenance. It does not replace Git or Hubnot authority and is never written back as signed collaboration facts.

## Guardrails

- Respect the governance blocks in `AGENTS.md`; read the pinned Next.js docs under `node_modules/next/dist/docs/` before writing component or route code.
- Do not weaken tests. Denial paths must keep refs unchanged; index paths must remain rebuildable (`tests/index-reconciliation.test.ts`).
- Distinguish procedures from evidence. A command a contributor could run is a procedure; recorded evidence must name the commands, environment, and the observed result of a run actually performed. Reference examples of recorded evidence in this repository: `kitty-specs/automatic-proposal-checks-01M78W2C/research/implementation-verification.md`, `kitty-specs/issues-and-discussions-01M78WCK/research/acceptance-evidence.md`, `kitty-specs/mdxeditor-upgrade-01M791SD/research/implementation-verification.md`.

## Supported commands

Exact commands are in [docs/development-and-acceptance.md](docs/development-and-acceptance.md). Summary:

- `npm run build` - production Next.js build and type check.
- `node --import tsx --test tests/<name>.test.ts` - focused Node suites. Native suites need `WORKBOX_HN_BIN` pointing at a Hubnot binary and skip when it is absent.
- `bash scripts/mcp-selftest.sh` - MCP self-test procedure.

## Where to look

- Authority model, commands, and test map: [docs/development-and-acceptance.md](docs/development-and-acceptance.md)
- Automatic proposal checks: `docs/automatic-proposal-checks.md`, `docs/automatic-proposal-checks-contract.md`
- Native collaboration qualification: `docs/native-collaboration-qualification.md`
- Read model: `src/lib/workbox/` (indexing in `index.ts`, database in `db.ts`)
- Hubnot integration: `src/lib/hn/` (runner, verifier, Git readers)
