# Implementation plan: Direct MCP proposal status

Branch: `codex/mcp-proposal-status` · [Specification](spec.md)

## Summary

Add `workbox_proposal_status` as a read-only MCP tool. Reuse Workbox's exact revision resolver and policy projection so the proposal page and agents agree on which revision they are viewing, whether it merged, and what still blocks progress.

## Technical Context

**Language/Version**: TypeScript, Node.js, React and Next.js App Router as pinned in Workbox.
**Primary Dependencies**: Existing Workbox MCP stdio server, Zod validation and Hubnot's versioned proposal read contract.
**Storage**: Existing project registry and Hubnot signed history. No schema migration or new write path.

## Shared read path

- Resolve the project through the existing local registry. Validate the full candidate ID using `isFullProposalId` and accept only `exact` or `lineage`, with `exact` as the default. Reject invalid arguments before invoking Hubnot.
- Reuse `resolveProposalDetail` for visibility and revision selection. Retain its bounded related-revision reads, exact-ID checks and incomplete flag. Use `proposalDetailHref` to construct exact links and preserve the identity of the original request when lineage mode selects another revision.
- Move the browser's revision label calculation from `ProposalDetailHeader` into a shared projection, including its live-candidate and incomplete-history rules. Use `getProposalChecks` for evidence readiness, maintainer decision and merge stages. Preserve the existing browser wording and behavior.
- Derive policy state from `createProposalReader`. Never infer a merge from a check, an acceptance, repository activity or a commit's presence. Expose signed merge IDs for the exact visible candidate from its verified native merge evidence. Keep a recorded merge and a lineage merge conflict separately representable.

## MCP response contract

| Result | Fields |
| --- | --- |
| Selected revision | Requested ID and mode, selected ID, canonical exact URL, visible lineage root when available, base and head commits, lifecycle state, and completeness. |
| Evaluated status | Shared stages and requirement rows, structured review and pipeline counts and deficits, qualified evidence IDs where available, remaining maintainer acceptances, merge state and signed merge evidence. |
| Revision choice | Visible candidates and their exact Workbox links, with completeness. No implicit choice or aggregate blockers. |
| Unavailable | Stable safe error for invalid input, unknown project or inaccessible candidate. A visible candidate with unavailable evaluation retains its exact identity and link, with unknown merge state and null blockers. |

Keep evidence blockers separate from outstanding acceptance and lineage restrictions. Preserve unknown code and incomplete history as explicit states. A verified empty blocker list means Hubnot evaluated the revision and found no missing policy requirements. Optional check failures remain informational and the existing automatic-check tool remains available for attempt details. Omit restricted lineage references and evidence that cannot be verified as visible. Register the handler through a structured MCP response path that preserves full public IDs. Use an allowlisted projection so raw native errors, repository paths and identity secrets cannot reach the client.

## Delivery sequence

1. Share the revision label and status projection with the browser. Exercise it with existing proposal lineage, checks and reader fixtures.
2. Add the MCP registration and read handler with stable result variants. Retain current proposal and automatic-check behavior on older Hubnot builds by reporting unavailable status when required capabilities are absent.
3. Verify the production browser and real MCP stdio server together against the same local Hubnot fixture. Keep fixtures self-contained and read-only during comparisons.

## Verification

- Compare the failing required README revision, its passing successor before acceptance, and the signed merged successor with the Workbox pages. Assert exact IDs, policy deficits, merge event, and that the older revision keeps its own evidence.
- Cover exact and lineage selection, ambiguous choices, a merged lineage, incomplete data, inaccessible candidates and invalid arguments. Check that the tool returns full identifiers and canonical exact links.
- Verify that an optional failure adds no policy blocker and that unavailable evaluation cannot masquerade as readiness. Snapshot Git refs, index and worktree around tool reads to catch writes.
- Run TypeScript and a production build, existing proposal reader, lineage and checks tests, and the new browser/MCP parity test. Full OS qualification belongs to release testing.
