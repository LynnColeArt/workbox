# Workbox

Workbox is a local web application for reviewing Hubnot projects: Git repositories that carry signed collaboration events. It presents a dashboard of project activity, an explore and code browser, issues and discussions, proposals with conversation and review, pipelines and CI, project memories, and a migration surface for importing history from other systems.

## Authority model

Workbox is a read-and-review layer over externally owned records.

1. **Git is the authority for object and ref history.** Durable facts are Git objects. Signed collaboration events are anchored as commits under `refs/hn/actors/*` and `refs/hn/memory/*` (`src/lib/hn/gitread.ts`), and reads re-verify them walk by walk (`src/lib/workbox/read.ts`). Denied or failed operations must leave refs unchanged; `tests/collaboration-native.test.ts` asserts this against the native binary.

2. **Hubnot is the authority for signed collaboration facts.** The `hn` binary, resolved by `src/lib/hn/runner.ts`, is the canonical writer and reader of signed events for issues, discussions, proposals, checks, and memories. Workbox routes collaboration writes through Hubnot and consults its visibility snapshot (`hn log --visible --json`) while indexing (`src/lib/workbox/index.ts`).

3. **The Workbox index is rebuildable.** The SQLite read model (`.workbox/index.db`, opened by `src/lib/workbox/db.ts`, path overridable with `WORKBOX_DB_PATH`) is a cache projected from Git. It can be deleted and rebuilt at any time; `src/lib/workbox/index.ts` reconciles the projection against the live refs and discards stale rows. Verification happens per event at read time, so a cached row's verification result is never trusted second-hand.

4. **GitHub is a migration source.** Third-party history enters through the migration surface (`src/lib/workbox/migrations.ts`, `src/components/migration-form.tsx`, `src/lib/workbox/github-pull-requests.ts`) as reviewed, session-tracked imports with explicit provenance. GitHub is never treated as an authority for Workbox collaboration facts, and imported records do not override Git or Hubnot state.

Earlier documentation described the SQLite database as a collaboration record. That guidance is retired; [docs/development-and-acceptance.md](docs/development-and-acceptance.md) is the current contract, and `CODEX-BRIEF.md` has been updated in place to match.

## Getting started

- Prerequisites: Node.js with npm, Git, and a Hubnot binary (`WORKBOX_HN_BIN` is used by test suites; the app resolves the installed binary through `src/lib/hn/runner.ts`).
- Projects root: `WORKBOX_PROJECTS_ROOT`, default `projects/` under the working directory. Discovery (`src/lib/workbox/discover.ts`) qualifies Git repositories that carry Hubnot signed refs, with skip and naming overrides from `workbox.registry.json`.
- Index database: `.workbox/index.db` by default, overridable with `WORKBOX_DB_PATH`.
- Demo seeding: `scripts/seed-demo.sh` and `scripts/seed-round2.sh` drive the real `hn` CLI to build a signed demo repository.

For development commands and the acceptance contract, see [docs/development-and-acceptance.md](docs/development-and-acceptance.md).

## Documentation

- [docs/development-and-acceptance.md](docs/development-and-acceptance.md) - authority model, supported commands, test map, and the retired-guidance record.
- [docs/automatic-proposal-checks.md](docs/automatic-proposal-checks.md) and [docs/automatic-proposal-checks-contract.md](docs/automatic-proposal-checks-contract.md) - automatic proposal checks.
- [docs/native-collaboration-qualification.md](docs/native-collaboration-qualification.md) - native collaboration qualification.
- [AGENTS.md](AGENTS.md) - repository agent rules (pinned Next.js guidance and workflow orientation).

## Repository map

- `src/app/` - Next.js pages and API routes: dashboard (`src/app/page.tsx`), explore, and per-project views for branches, CI, code, discussions, insights, issues, memories, proposals, pull requests, and settings (including `settings/migrations`).
- `src/lib/workbox/` - read model and services: indexing (`index.ts`, `db.ts`), discovery (`discover.ts`), issues, discussions, proposals, pipelines, settings, and migrations (`migrations.ts`).
- `src/lib/hn/` - Hubnot process runner (`runner.ts`), Git ref readers (`gitread.ts`), and signature verifier (`verifier.ts`).
- `mcp/` - MCP server exposing the same functionality over HTTP and stdio.
- `tests/` - Node test runner suites (`node --import tsx --test tests/<name>.test.ts`).
- `scripts/` - operational helpers: indexing (`scripts/index.ts`), MCP self-test (`scripts/mcp-selftest.sh`), demo seeding, and activity proofs.
