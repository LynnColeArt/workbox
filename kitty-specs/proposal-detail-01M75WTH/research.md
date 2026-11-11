# Research — Proposal detail and next actions

| Decision | Evidence and rationale | Alternative considered |
|---|---|---|
| Use exact native status for readiness and lineage. | `hn proposal status FULL_ID --json` returns the candidate, policy, current reviews, named pipelines, lineage, decisions, and observed preconditions. Workbox currently assembles status from locally indexed events and worktree policy, which can split evidence into a proposal row or use policy from the wrong commit. | Reimplementing Hubnot's evaluator in Workbox would duplicate project policy and evidence semantics. |
| Use selected-history event reads for evidence and degraded detail. | `hn event show FULL_ID --json` reports `visible_operative_history`. Hubnot's raw signed log may include hidden or unadmitted events. A visible revision can have an unavailable predecessor. | Exposing all verified SQLite events would confuse signature verification with visibility. Human CLI prose is unsuitable as a structured fallback. |
| Treat next actions as guidance until the writer checks authority. | Status preconditions exclude signer and target-checkout checks. `hn identity show --json` can inspect the active public identity separately. Review, decision, and merge commands perform their own guards. | Mapping `readiness: true` to an enabled merge control would misrepresent both project policy and the current checkout. |
| Compare the signed base and head commits directly. | Both commit IDs are in the candidate and remain stable after a branch move. Workbox already reads Git through a repository-scoped adapter. | Resolving branch tips, the worktree, or a newly computed merge base could show code the developer is not reviewing. |

Source inspection also confirmed that `proposal.revise.subject` names its predecessor, review and decision subjects name exact candidates, and run results name run requests. Preserve those distinctions in Conversation.

The main integration risk is a large or partially indexed lineage. Plan for bounded discovery and distinguish incomplete results from an empty list.

[Hubnot exact proposal and event reads](https://github.com/LynnColeArt/hubnot/blob/main/docs/consumer-cli-v1.md#exact-proposal-reads) · [Hubnot proposal implementation](https://github.com/LynnColeArt/hubnot/blob/main/proposal.go) · [Hubnot evidence evaluation](https://github.com/LynnColeArt/hubnot/blob/main/policy.go)
