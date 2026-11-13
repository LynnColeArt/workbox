# Automatic proposal checks

A repository can enable pipelines for proposal opens and for revisions with a new code commit. In Workbox, open **Settings → Workflows → Pipeline draft → Automatic proposal checks**. Load the active rules, choose the events for each pipeline, review the exact changes and open a Hubnot proposal. Settings can review a pipeline draft and its trigger changes together. The committed configuration becomes active on the runner's configured target branch. The proposal Checks view and MCP both show status and signed attempts for the selected revision.

## Run a scheduling authority

Install a Hubnot build that advertises `native.proposal-checks-config`, `native.proposal-checks-observer` and `native.proposal-checks-runner` in `hn capabilities --json`. Upgrade governed merge evaluators before enabling the runner. Use a dedicated Linux clone with Bubblewrap, the required toolchain, and offline dependencies. The runner checks namespace support and shows waiting checks if isolation is unavailable.

Choose one clone as the scheduler and use a trusted maintainer identity authorized for required pipelines. In that clone, initialize against the canonical local target ref before the first runner sync.

```sh
hn proposal-checks init refs/heads/main --json
hn runner automatic-watch --remote origin
```

The runner syncs proposal facts. Keep the local target branch up to date through normal governed repository operations. Keep the scheduling clone's Git common directory, including `hn-automatic-checks.json`, when restarting or moving the authority. Stop the old service before moving its state. A second clone can sync signed results and view them, but it has no live queue. The ledger fences concurrent workers in the same Git common directory. A crash after signed publication can recover that result. An interrupted unsigned attempt is visible as canceled. Existing manual runs remain available.

The initial baseline excludes proposals already visible at registration. Rules affect newly observed events. Changing a rule leaves previously queued checks pinned to their original configuration and definition. Proposal code runs in an isolated workspace. Hubnot applies its existing policy requirements to signed evidence.

## MCP

- `workbox_proposal_triggers` reads the active rules and source commit.
- `workbox_review_proposal_triggers` validates a draft and returns exact proposed changes.
- `workbox_submit_proposal_triggers` submits the confirmed draft with its original operation ID.
- `workbox_automatic_proposal_checks` reads an exact proposal revision and its attempt history.

Full operating system qualification belongs to release testing.
