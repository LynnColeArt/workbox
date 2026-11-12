# Repository Settings implementation plan

The Settings tab and MCP call the same Workbox application operations. Keep public results independent of Next.js and MCP transport. Reuse pinned Git reads, the local curation store, Hubnot's machine-readable workflow reads, and existing proposal detail links.

## Decisions

| Concern | Approach |
| --- | --- |
| Project details | Extend the existing local `project_meta` overlay with a nullable display name. Preserve legacy description rows and route behavior. Read the overlay consistently wherever project details are shown. Keep local curation separate from signed repository configuration. |
| Workflow inventory | Resolve the default branch with the Code view resolver and read its tree and policy at one commit. Use bounded object reads and distinguish an absent directory, malformed files, and missing objects. Treat signed workflow resources as a separate native inventory, with bounded pagination and the native revision, status, and conflict heads. |
| Validation | Parse draft text in memory against the committed `hn.pipeline/0` contract documented by Hubnot's `ci.go`. Verify compatibility against real Hubnot in disposable fixtures. Report the checks performed and any unavailable native validation explicitly. Never call the existing CI edit API or a native write or execute command during validation. |
| Preview | Return the exact previous and candidate bytes, source path, base branch and commit, current public signer when available, and a digest over the reviewed inputs. Recompute the digest server-side before writes. Keep the draft in the browser or MCP client. |
| Submission | Require an explicit confirmation and one stable caller operation ID. Stage a candidate with only the reviewed pipeline change, anchored to the exact base, using Git objects and a private index. Recheck the current default branch, base, signer, capability, and input before publication. Keep the normal index and worktree outside this path. |
| Authorization | Route both transports through the same repository and action policy. Browser writes must come from the trusted local application context. MCP writes use the same local operator configuration and native authorization. Native errors are mapped to controlled public outcomes. For a local deployment, bind the HTTP listener to loopback. Browser origin checks address cross-origin requests and do not authenticate arbitrary network clients. A network-facing deployment requires an authenticated operator boundary before enabling writes. |

## Native capability and retry contract

Source inspection of Hubnot's `ci.go` found an internal committed pipeline loader and validator. The examined CLI has no standalone pipeline validation command. Hubnot's `proposal.go` accepts exact base and head commits, but the inspected `proposal open` command uses the active identity, appends the signed event before creating its code ref, and has neither an operation key nor an exact result lookup by operation. Do not treat prose, actor chain tip, an empty search result, or a failed native exit as proof of the operation outcome.

Require a capability that pins the signer and supports idempotent publication and recovery before enabling Settings proposal writes. Define the adapter around these semantics so compatible Hubnot versions can negotiate them without a Workbox UI change. If the capability is missing, retain reads, validation, and preview, and expose submission as unavailable in both transports. Keep this dependency visible in release acceptance. A Workbox receipt alone cannot close the crash window between native signing and recording a result.

A capable submission binds the operation ID to repository, signer, exact base, candidate bytes, and user-visible proposal content. The same binding returns the exact prior result, even if the base has since advanced. A different binding fails as a conflict. Check for a recorded result before stale-base rejection, then check the base again immediately before any new publication. If an event exists with incomplete code publication or indexing, recover that candidate and preserve its exact event identity. A result which cannot be reconciled returns an explicit recovery state and must never trigger another append.

## Interfaces and UI

- Shared operations for Settings read, local detail update, pipeline preview, and explicit proposal submission or recovery. Responses distinguish invalid input, unchanged draft, stale preview, denied action, unsupported capability, and recoverable publication.
- Add a Settings page under the existing repository navigation. Show Details and Workflows, label local curation, and place committed pipelines and signed resources in separate sections. Use a retained draft editor, accessible diagnostics, exact preview, and an explicit proposal button with its current availability.
- Add browser route handlers and MCP tools as thin callers. Use existing Code and Proposal detail address builders. Preserve existing CI reads and editing entry points and link from CI to the governed proposal flow.

## Verification and rollout

1. Verify old and new databases, authorized and unauthorized updates, and read parity on a configured non-main default branch with dirty checkout changes. Include empty, malformed, unavailable, and conflicted workflow inventories.
2. Compare browser and MCP preview bytes and diagnostics. Snapshot repository refs, status, index, signed history, and run requests before and after validation to demonstrate no writes.
3. With a compatible native capability, prove exact candidate contents and usable proposal links. Inject a failure before signing, after signing, after code-ref publication, and before indexing completes. Run simultaneous browser and MCP submissions with the same operation ID and assert a single signed proposal. Verify stale and denied outcomes create none.
4. On current Hubnot, verify the explicit unavailable outcome and successful inspection and preview. Run focused Linux verification, type checking, lint, and a production build. Full OS testing remains release qualification.
