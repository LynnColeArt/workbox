# Automatic proposal checks work packages

Target branch `codex/automatic-proposal-checks`. See the [specification](spec.md) and [implementation plan](plan.md).

## Repository boundaries

WP01–WP03 require a companion Hubnot delivery. Their Workbox lanes own consumer contracts and tests. Native code lands in Hubnot under its own Git and Spec Kitty workflow, with exact companion commits recorded in each Workbox review. The Workbox task runner does not modify the Hubnot checkout. An approved native package requires real Hubnot evidence, not a Workbox mock. WP04 can start once WP01 establishes the shared contract. WP05 and WP06 share MCP registration and run in sequence.

## Work Package WP01 — Hubnot trigger and evidence contracts (Priority: P1)

- **Prompt** [WP01-native-contract.md](tasks/WP01-native-contract.md)
- **Dependencies**: None

- [ ] T001 Define the native capability, trigger configuration format and strict validator for the complete draft tree. Specify absent configuration, repeated keys or events, unknown events, and missing or removed pipelines. (WP01)
- [ ] T002 Define exact candidate, trusted definition, configuration source, check, attempt, and authority identities and their native read and evidence envelopes. Specify old-reader and old-binary behavior, including manual runs. (WP01)
- [ ] T003 Publish the Workbox consumer contract and fixtures against the companion Hubnot implementation. The Hubnot change owns the native schema and validator. (WP01)

## Work Package WP02 — Hubnot observation and durable scheduling (Priority: P1)

- **Prompt** [WP02-scheduler.md](tasks/WP02-scheduler.md)
- **Dependencies**: WP01

- [ ] T004 Implement in the Hubnot companion the single registered scheduling authority, persistent event decisions and check ledger, with opt-in and a coherent pre-sync historical baseline. Document registration, recovery and migration. (WP02)
- [ ] T005 Observe verified admitted proposal.open and proposal.revise events independently of Workbox. Compare predecessor and candidate heads, pin active configuration at first observation, and retain incomplete prerequisites for reconciliation. (WP02)
- [ ] T006 Make observation and scheduling atomic. Use shared claims, lease fencing and stable check and attempt IDs. Verify restart and replay, including late sync without using author timestamps. (WP02)

## Work Package WP03 — Hubnot isolated execution and trusted policy evidence (Priority: P1)

- **Prompt** [WP03-execution.md](tasks/WP03-execution.md)
- **Dependencies**: WP02

- [ ] T007 In Hubnot, connect claimed attempts to the existing runner. Check explicit opt-in, runner authorization and actual Linux isolation availability. Report blocked prerequisites and keep the automatic path free of host fallback. (WP03)
- [ ] T008 Load the pinned trusted definition independently from the exact candidate workspace. Bind signed evidence to request, pipeline, candidate, definition and attempt. Reconcile ambiguous publication by operation identity before continuing. (WP03)
- [ ] T009 Integrate automatic evidence with both policy status and merge authorization. Keep manual request semantics and existing policy thresholds. Publish native status and history for consumers, including interrupted or canceled attempts where applicable. (WP03)

## Work Package WP04 — Shared Settings trigger drafts and exact submission (Priority: P1)

- **Prompt** [WP04-settings-service.md](tasks/WP04-settings-service.md)
- **Dependencies**: WP01

- [ ] T010 Consume native capability and active configuration with source revision. Extend the shared draft to carry trigger toggles alongside Graph and JSON pipeline edits. (WP04)
- [ ] T011 Validate the complete proposed tree through Hubnot. Return matching diagnostics, exact bytes and multi-file diff without writing refs, durable draft state or scheduling state. (WP04)
- [ ] T012 Extend governed submission with authorization, reviewed base and actor checks, and the existing immutable operation key. Preserve a draft across stale or uncertain results. (WP04)

## Work Package WP05 — Settings browser and MCP trigger controls (Priority: P1)

- **Prompt** [WP05-settings-parity.md](tasks/WP05-settings-parity.md)
- **Dependencies**: WP04

- [ ] T013 Add independent Open and New revision toggles for each pipeline in Settings. Show the active rules and revision, validation diagnostics, exact review and explicit proposal submission. (WP05)
- [ ] T014 Expose the same read, draft, validation, review and submission actions through typed MCP tools backed by the shared operations. Keep Graph and JSON in the same draft. (WP05)
- [ ] T015 Verify both surfaces use the same permissions, diagnostics, diff, operation identity, stale recovery and absent capability. Include the Go starter test pipeline. (WP05)

## Work Package WP06 — Revision checks in proposal detail and MCP (Priority: P1)

- **Prompt** [WP06-proposal-parity.md](tasks/WP06-proposal-parity.md)
- **Dependencies**: WP03, WP05

- [ ] T016 Extend the shared proposal checks view model and exact candidate selectors with native status, reason, pinned definition and configuration, timestamps, attempts and evidence. (WP06)
- [ ] T017 Render the same selected revision and available run details in proposal detail and MCP. Distinguish ineligible and unavailable from waiting, and preserve old revisions and signed evidence. (WP06)
- [ ] T018 If the native capability supports explicit retry, expose it on both surfaces with the same permissions and idempotent request. Keep each retry visible as a distinct attempt. (WP06)

## Work Package WP07 — Cross-repo lifecycle and rollout verification (Priority: P1)

- **Prompt** [WP07-acceptance.md](tasks/WP07-acceptance.md)
- **Dependencies**: WP03, WP05, WP06

- [ ] T019 Run production browser and MCP against the real Linux Hubnot runner and a synced second clone. Cover opens from browser and CLI, a synced revision, trigger changes via governance, and restart without a duplicate logical check. (WP07)
- [ ] T020 Verify the exact reviewed configuration, pinned definition and signed policy evidence through the journey. Run compatibility cases for an older Hubnot binary, no trigger file and unavailable runner. (WP07)
- [ ] T021 Record evidence and operator rollout and recovery instructions. Release the Hubnot capability before Workbox enables it. Reserve the full OS matrix for release qualification. (WP07)
