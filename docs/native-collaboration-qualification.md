# Native collaboration qualification — pinned Hubnot

How Workbox qualifies native collaboration — issues, discussions, and proposal
review/disposition — against one pinned Hubnot revision, through both the
browser and MCP. Companion records:

- `kitty-specs/issues-and-discussions-01M78WCK/research/native-contract.md` —
  the per-surface CLI contract this matrix exercises.
- `docs/automatic-proposal-checks-contract.md` — checks capability
  advertisement and result semantics.
- `kitty-specs/issues-and-discussions-01M78WCK/research/acceptance-evidence.md` —
  the retained 2026-11-12 live run.

**Record status.** Authored against Workbox snapshot
`88561da1816929056b6afd6096dbc5e35fa5fb21`. The protocol is complete; the live
matrix run for a fresh pin was not executed while authoring it — the authoring
worker has repository file reads/writes and the host's fixed checks only, with
no Hubnot binary, browser, or MCP harness reachable. Nothing below is claimed
as passing from the authoring session; unexecuted coverage is listed under
**Blocked coverage**. The latest retained live run is the 2026-11-12
qualification.

## Fleet-acceptance mapping

- Pin + capability checks → **Pin** rules and row R1.
- Browser and MCP issue/discussion reads and writes → R2–R7.
- Proposal review, acceptance and rejection → R8–R11.
- Exact revisions → R8 (exact mode) and the revision discipline in **Fixture**.
- Moved/stale targets → R4 (issues), R7 (discussions), R10 (proposals).
- Rejection capability discovery → R9.
- Replay → R5 and the disposition-replay probe in R10.
- Unsupported versions → the dedicated section below.

## Pin

| Field | Value |
| --- | --- |
| Tested Hubnot commit | `91f3e09d` — local Hubnot `main` at source inspection, recorded 2026-11-12 in `kitty-specs/issues-and-discussions-01M78WCK/research/native-contract.md` |
| Deployment binary inspected | `graph-QQIhU2/hn` (self-reports `0.0.1-dev`) |

Pin rules:

1. A version string establishes nothing: this deployment's `hn` reports
   `0.0.1-dev`. Availability comes only from `hn capabilities --json`.
2. Before the first tool call of every qualification session, run
   `hn capabilities --json` and store the verbatim output. Re-check whenever
   `WORKBOX_HN_BIN` changes or a scheduling clone moves (keep the common
   directory, including `hn-automatic-checks.json`, when moving an authority).
3. Exercise only advertised capabilities. Anything else is recorded as
   blocked, with the capability diff stated.
4. Update the pin row whenever the binary is rebuilt from a different Hubnot
   checkout (`git -C <hubnot-checkout> rev-parse HEAD`) and re-run the
   affected rows.
5. A matrix result stored without its capability capture qualifies nothing.

## Disposable fixture

Everything runs on disposable repositories. Never touch any `~/projects/*`
repository other than the Workbox checkout under qualification.

```sh
root=$(mktemp -d /tmp/wb-qual-XXXXXX)
export WORKBOX_PROJECTS_ROOT="$root"
export WORKBOX_HN_BIN=/path/to/pinned/hn
export WORKBOX_DB_PATH="$root/index.sqlite"

git init -q "$root/qual-a"
hn init "$root/qual-a"            # inert: only .git/hn/identities/
mkdir -p "$root/evidence"
hn capabilities --json | tee "$root/evidence/capabilities.json"
```

For the conflict-transfer row, prepare a second repository (`qual-b`) exactly
as `tests/collaboration-native.test.ts` prepares its second repository; the
2026-11-12 run proves a signed sibling conflict transfers between
repositories and resolves using all current heads.

For permission rows, select an authority with contribution policy the way
`tests/collaboration-native.test.ts` does, and keep two identities
available: `hn identity show --json` identifies the signer; `--actor` pins an
actor and rejects a fingerprint mismatch.

Revision discipline (README `hn` laws): flags precede free text; expected
revisions are the full `data.items[0].id` from `hn issue heads <id> --json`
for `--expect`; close is a revise with `intent:"close"` and `previous`; an
issue's id equals its opening event id.

## Matrix

Each row is exercised twice — browser and MCP — except R1, which is the
gate. A row passes only when both transports meet the pass criterion and the
raw outputs are retained.

| Row | Scenario | Browser | MCP | Pass criterion |
| --- | --- | --- | --- | --- |
| R1 | Pin and capability gate | record the acting identity for the session | capture `hn capabilities --json` verbatim | `capabilities.json` stored beside the pin; unadvertised surfaces skipped and logged |
| R2 | Issue reads | list with title/number search, label filter, paging; open detail | `hn issue list --details`, `issue show`, `issue heads`, `issue history --kind comments` | same state and conversation in both transports; envelope-level `snapshot`/`next_cursor`; stable local numbers and legacy links resolve |
| R3 | Issue writes | open → comment → revise title/description/labels → close → reopen | mirror with `open`/`comment`/`revise`/`close`/`reopen`; `--input -` for full-state open/revise | every write returns `data.issue_id` and `data.event_id`; edits merge into the observed state preserving criteria, relations, assignees, metadata; ordinary edit pins one current head; timelines agree after refresh |
| R4 | Stale issue target and conflict | submit an edit against a stale revision: draft preserved, change shown, resubmit after refresh | mirror; transfer the conflicting chain between `qual-a`/`qual-b` and `resolve` | native stale denial in both transports, no duplicate event; `resolve --input -` pins all competing heads |
| R5 | Replay after interrupted write | provoke a lost response on a comment, retry once | retry with `--operation`, same payload and same expected revision; look up via `issue operation` / `discussion operation` / `discussion-reply operation` | replay returns the original signed event exactly once; a changed request under the same key is rejected; signed result and Workbox index refresh reported as independent outcomes; admission state surfaced when present |
| R6 | Discussion reads | browse threads, category/status filters, paging; open a thread | `discussion list/show/heads/history/replies` | `data.snapshot`/`next_cursor` agree; `reply_count` and exact `accepted_answer` match; paging advances past empty pages and posts land on a fresh snapshot |
| R7 | Discussion writes | categorized open; contextual reply with target visible while composing and after; reply edit; category change; close/reopen; accept/clear answer | mirror with `discussion open/revise/category/close/reopen/answer`, `discussion reply add/edit`, full-state `discussion resolve`, `discussion-reply resolve` | accepted answer binds the exact reply revision and stays pinned when the reply is later edited; each write returns `data.resource_id` and `data.event_id`; stale denial behaves like R4 |
| R8 | Proposal disposition on the exact revision | Proposals tab actions on the exact candidate; open the Checks page for the selected revision | `workbox_proposal_status` with the full signed event ID, exact mode | `data.kind` `candidate` with requested = selected revision, exact Checks-page link, lifecycle label, recorded merge state plus verified merge event IDs, policy requirements, maintainer acceptance, `decision.deficit`; `blockers` null (evaluation unavailable) is never read as empty |
| R9 | Proposal rejection and capability discovery | attempt rejection as an authorized maintainer, then as an unauthorized identity | mirror | see **Rejection discovery** — one of supported+allowed / supported+policy-denied / not advertised, recorded verbatim and honored |
| R10 | Moved/stale proposal targets and disposition replay | preview a comparison, move a branch, refresh before signing; replay an acceptance | `workbox_proposal_status` lineage mode; stale candidate lookup | see **Moved and stale proposal targets** |
| R11 | Automatic checks for the selected revision | proposal Checks view status and attempts | `workbox_automatic_proposal_checks` for the exact revision | attempt history shows exact attempts; a queue entry is never treated as signed evidence; manual runs remain available; automatic results count as eligible only with observer/runner advertised and governed policy evaluators upgraded |
| R12 | Identity and permission parity | acting identity shown before each signed action; denial explained | `identity show --json`; `--actor` mismatch probe | the same contribution-policy denial appears for issues and discussions in both transports; denied operations leave `refs/hn/` unchanged |

### Rejection discovery (R9)

1. Re-read the verbatim capability capture; note whether any
   rejection/disposition surface is advertised for proposals.
2. Attempt rejection twice — once as an identity the policy authority
   authorizes, once as one it does not — in the browser and over MCP.
3. Record one of three outcomes byte-for-byte from the `{ok,data,error}`
   envelope or the MCP error: supported and allowed; supported and
   policy-denied (identical denial text in both transports, refs unchanged);
   not advertised.
4. The row passes when the outcome is recorded and honored, whichever of the
   three it is. If the CLI has no rejection operation at this pin, the
   browser affordance stays unavailable — the same doctrine as append-only
   issue comments, which await an explicit Hubnot extension rather than a
   simulated signed change.

### Moved and stale proposal targets (R10)

- Move the source branch in the fixture after previewing a comparison. The
  compared revisions changed: the flow must refresh and require review of the
  updated revision before any signature is requested.
- `workbox_proposal_status` lineage mode returns the `choose` shape — visible
  revisions with exact links. A stale or unavailable candidate returns the
  documented `not_found`/`unavailable` codes, never a fabricated state.
- Replay a disposition by attempting the same acceptance twice and record the
  native behavior. If no operation binding exists for dispositions at this
  pin, record the gap; do not simulate a signed disposition in the index.

### Unsupported Hubnot version

Build or stub a binary that advertises none of the required capabilities,
point `WORKBOX_HN_BIN` at it, and re-run the fixture. Assert:

1. `hn capabilities --json` lists none of them; keep the verbatim dump.
2. The browser offers none of the affected actions; capability-dependent
   operations stay unavailable (issue comment edit/delete in particular).
3. MCP surfaces the adapter's known-unavailability error; native denials pass
   through both transports instead of being swallowed.
4. Missing `native.proposal-checks-config` reads as missing support, distinct
   from a repository with triggers disabled; observer and runner capabilities
   are treated as separately advertised or absent.
5. `git for-each-ref refs/hn/` is unchanged and the SQLite projection gains
   no fabricated signed state — the database is a cache, never a record.

Status: not yet exercised — see **Blocked coverage**.

## Evidence retention

Per session store under
`kitty-specs/issues-and-discussions-01M78WCK/research/qualification/<date>-<hubnot-short>/`:

- `pin.md` — the pin row values and the Hubnot checkout's `rev-parse` output.
- `capabilities.json` — verbatim capability capture.
- `commands.jsonl` — every `hn` invocation and its raw `{ok,data,error}`
  envelope.
- `mcp-transcript.jsonl` — tool calls and responses for every MCP column.
- `browser/` — page states or traces for every browser column.
- `result.md` — the matrix filled in row by row, including blocked rows.

## Retained evidence (2026-11-12 baseline, source `91f3e09d`)

From `kitty-specs/issues-and-discussions-01M78WCK/research/acceptance-evidence.md`:

- Production HTTP and stdio MCP exercised complete issue writes, stable legacy
  links and tools, synced issue conflicts, exact Markdown source and preview,
  duplicate suppression, stale writes, and resolution.
- Both transports returned the same Hubnot contribution-policy denial for
  issues and discussions; denied operations left Git refs unchanged.
- Discussion tests exercised contextual replies, accepted-answer selection,
  and editing a reply while the answer stayed pinned to the accepted revision.
- A governed fixture reproduced concurrent native admission lock contention;
  bounded retries handle that diagnostic and the same fixture passes.
- Headless Chrome exercised keyboard Markdown formatting and focus, issue
  creation and editing, lost-response comment recovery, close and reopen,
  historical revisions, draft preservation across a concurrent paginated edit,
  discussion creation, preview, replying, accepting and editing an answer,
  close and reopen, and stale draft review before resubmission.
- Native and shared-service tests recovered a signed operation without a
  duplicate after a lost response or index failure; signed issue comments use
  Hubnot's append-only comment contract.
- Hubnot source suite from a disposable archive:
  `TestIssueCommandsReplayLifecycle`,
  `TestIssueCommandsConflictAndPartialResolution`,
  `TestDiscussionNativeLifecyclePinnedAnswerAndReads`,
  `TestContributionCLIGovernedSpecializedResourcesAndHiddenDependencies`.

That run qualifies its own pin only. It does not qualify a Hubnot revision
that was not capability-checked under this protocol.

## Blocked coverage

As of this record (Workbox snapshot `88561da1816929056b6afd6096dbc5e35fa5fb21`):

1. A live run of R1–R12 against a re-confirmed pin — the authoring worker has
   no Hubnot binary, browser, or MCP harness.
2. R1's verbatim capability capture for the pin: the contract names
   `native.proposal-checks-config` (version 1) plus separately advertised
   observer and runner capabilities, but no capture is retained as evidence.
3. The **Unsupported Hubnot version** section in full.
4. R9 proposal-rejection discovery; R10 disposition replay and moved/stale
   proposal targets against the current build.
5. Guided branch selection for proposal creation (spec follow-up): when the
   pinned build lacks it, R10 records the Workbox gap instead of exercising it.

Full operating-system qualification stays in release testing, as
`docs/automatic-proposal-checks.md` records.
