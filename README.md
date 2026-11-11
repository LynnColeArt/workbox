# Workbox

A communal room for hubnot projects — a GitHub-shaped portal over hubnot
repositories. Trust is rendered, not hidden: every fact shown here is a
signed event chain carried by Git, verified against the identity invariant
before display.

## What it is

- **Discovery**: scans a projects root for repos carrying hubnot signed
  facts (`refs/hn/actors/*`; private identity state counts as initialized).
  Override the root with `WORKBOX_PROJECTS_ROOT`.
- **Read model**: an indexer walks every actor chain, verifies each event
  (id digest, key→actor binding, Ed25519 signature), and projects issues,
  comments, conflicts, and an activity feed into a local SQLite database.
  The database is a cache, never a record — delete it and re-index freely.
- **UI**: dashboard (cross-project activity, the living front page),
  project pages (GitHub-familiar issue lists), and issue pages with the
  full signed event chain and per-event verification badges.
- **Write path (v1 planned)**: mutations flow through the real `hn` CLI,
  using its documented `{ok,data,error}` envelope contract — never prose.

## Layout

- `src/lib/hn/` — the hubnot port: adapter (CLI runner), git reader,
  signature verifier. Nothing outside this folder touches hubnot storage.
- `src/lib/workbox/` — discovery, index writer, UI queries, event schema.
- `scripts/seed-demo.sh` — seeds a genuine demo repo via the real CLI.
- `scripts/index.ts` — index + proof run (prints verified counts, the
  projected board, and the live feed).
- `scripts/init-all-repos.sh` — idempotent `hn init` across a projects
  root (private identity state only; no refs, no worktree changes).

## Installation

### Debian and Ubuntu (preferred)

Workbox will use the same signed [Kinetic Actor package archive](https://packages.kinetic.actor/)
as Hubnot. If you already install Hubnot from this archive, skip the setup.
Otherwise, add the archive once.

```sh
sudo apt update
sudo apt install ca-certificates curl
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://packages.kinetic.actor/kinetic-actor-archive-keyring.gpg | sudo tee /etc/apt/keyrings/kinetic-actor.gpg > /dev/null
sudo chmod 0644 /etc/apt/keyrings/kinetic-actor.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kinetic-actor.gpg] https://packages.kinetic.actor/ ./' | sudo tee /etc/apt/sources.list.d/kinetic-actor.list
```

The Workbox package is pending publication. Once it appears in the archive, install it with APT.

```sh
sudo apt update
sudo apt install workbox
```

### Running from source

```bash
go build -o /tmp/hn .            # in ~/projects/hubnot (nogithub tag also fine)
npm install
npx tsx scripts/index.ts         # WORKBOX_PROJECTS_ROOT=~/projects
npm run dev                      # then Sync → /api/sync or run scripts/index.ts
```

Environment: `WORKBOX_PROJECTS_ROOT` (projects scan root),
`WORKBOX_HN_BIN` (hn binary path), `WORKBOX_DB_PATH` (read-model path).

## hn CLI laws (learned live, 2026-11-11)

1. **Flags precede free text.** `"Title" --json` refuses: every flag must
   come before positional arguments.
2. **`--expect` always requires the full issue head.** `hn issue heads ID
   --json` → `data.items[0].id` is the revision. Short or wrong revs
   refuse.
3. **Close is a revise.** `issue close` appends an `issue.revise` event
   with `"intent":"close"` carrying full issue state, with `previous`
   linking the chain.
4. **Resource id invariant**: an issue's id equals its opening event id.
5. **Init is inert**: `hn init` writes only `.git/hn/identities/` — no
   refs, no worktree changes. External pointer worktrees cannot be
   inited; their primary covers them.

## Known generation drift (handled)

Events from 2026-09 (hubnot repo itself) carry issue payloads flat;
2026-11 events nest them under `"issue"`. The projector accepts both.
