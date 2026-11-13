# Hubnot automatic proposal checks contract

Hubnot advertises configuration support as `native.proposal-checks-config` version 1 in `hn capabilities --json`. Consumers must detect this capability. Missing support is distinct from a repository with triggers disabled. Configuration support alone says nothing about runner availability.

- `hn proposal-checks read FULL_COMMIT --json` returns `source`, `digest` and `configuration` for the exact supplied commit. A missing file returns a null digest and empty rules.
- `hn proposal-checks validate - --json` accepts a draft on standard input with `configuration` and `pipelines`, a map of pipeline names to complete proposed definitions. The result includes `canonical`, the exact JSON text for `.hn/proposal-checks.json`, and the decoded `configuration`. Validation uses the proposed tree supplied by the caller and has no repository writes. Submission must independently recheck that tree and base.

The file has version `hn.proposal-checks/1` and a `pipelines` map to event lists. The supported events are `proposal.open` and `proposal.revise`. Empty lists disable the pipeline. Duplicate object keys and event values, unknown events and invalid or missing referenced definitions are rejected. The Go starter pipeline is selectable by name like any other definition.

The scheduling authority owns one logical check for the repository identity, proposal lineage, exact candidate event and pipeline. Candidate head is stored separately from the active source commit. A versioned signed automatic request binds the configuration digest, source commit, check and attempt identities. The signed result binds those fields by referencing the exact request. Retries are distinct attempts on the same logical check. A consumer must not interpret a queue entry as signed evidence.

The scheduler and execution packages must advertise their capability separately once available. Mixed-version deployments must upgrade governed policy evaluators before treating automatic results as eligible. Manual requests retain their existing format and definition selection.
