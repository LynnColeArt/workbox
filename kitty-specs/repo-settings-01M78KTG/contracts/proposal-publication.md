# Native proposal publication dependency

The installed Hubnot binary advertises signed workflow reads and exact proposal reads, but its proposal creation command has no operation key or expected signer. The existing implementation signs first and publishes the code ref afterward. A crash or failed ref write can therefore leave a signed opening without a usable proposal.

Workbox needs a native operation with the following behavior before enabling the Settings submit action.

| Input or outcome | Required semantics |
| --- | --- |
| Capability discovery | Advertise a versioned, machine-readable contract. Older clients can continue using the existing command. |
| Initial submission | Accept the full base commit, exact candidate commit, expected active actor, stable operation ID, and exact title and body. Validate native policy and compare the selected actor before appending. |
| Stable result | Return the full signed opening ID and exact base and head. The result must refer to the operation's original candidate. |
| Same operation and intent | Return the existing result or finish publication of its existing code ref. The retry remains usable after the default branch moves. |
| Same operation with changed intent | Reject the conflict without signing. Scope operation identity to the repository and actor. |
| Concurrent requests | Publish at most one signed opening for the operation. The operation lookup and event append must share a native concurrency boundary or equivalent compare-and-swap semantics. |
| Partial publication | Provide a structured status or an exact read by actor and operation. If code is missing, either repair the ref to the signed head or report an explicit recovery state without signing again. |
| Denied, absent, or uncertain | Distinguish authoritative absence from unavailable evidence, denied access, and ambiguous history. A nonzero exit or missing output alone does not establish absence. |

The capability must continue to enforce Hubnot's existing candidate checks and contribution policy. Acceptance requires real native fixtures for duplicate, concurrent, actor mismatch, and interruption after the signed event but before the caller receives its result. Workbox must also verify the exact proposal link through its normal read path.

On installed Hubnot versions without this capability, Workbox validates and previews the draft without Git writes, and an explicit submit attempt returns `unsupported` through browser and MCP.
